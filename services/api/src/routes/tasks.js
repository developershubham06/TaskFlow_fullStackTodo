const { Router } = require('express');
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth');

const taskRoutes = Router();

// All task routes require authentication
taskRoutes.use(authenticate);

// GET /api/tasks — Fetch all tasks (shared board)
taskRoutes.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    const filter = {};

    if (status && ['todo', 'in-progress', 'done'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const tasks = await Task.find(filter)
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 });

    res.json({ tasks });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/tasks — Create a new task
taskRoutes.post('/', async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const task = new Task({
      title: title.trim(),
      description: description ? description.trim() : '',
      status: 'todo',
      createdBy: req.user.id,
    });

    await task.save();
    await task.populate('createdBy', 'name email');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('task:created', task);
    }

    res.status(201).json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id — Update a task (with conflict resolution)
taskRoutes.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, updatedAt: clientUpdatedAt } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Conflict resolution: last-update-wins using timestamps
    if (clientUpdatedAt) {
      const clientTime = new Date(clientUpdatedAt).getTime();
      const serverTime = new Date(task.updatedAt).getTime();

      if (clientTime < serverTime) {
        // Client has stale data — return current version
        await task.populate('createdBy', 'name email');
        return res.status(409).json({
          error: 'Conflict: This task was updated by someone else',
          task,
        });
      }
    }

    // Apply updates
    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (status && ['todo', 'in-progress', 'done'].includes(status)) {
      task.status = status;
    }

    await task.save();
    await task.populate('createdBy', 'name email');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('task:updated', task);
    }

    res.json({ task });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id — Delete a task
taskRoutes.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await task.deleteOne();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('task:deleted', { id });
    }

    res.json({ message: 'Task deleted', id });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = taskRoutes;
