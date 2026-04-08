'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocket } from '@/context/SocketContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const COLUMNS = [
  { id: 'todo', title: 'Todo', icon: '○' },
  { id: 'in-progress', title: 'In Progress', icon: '◐' },
  { id: 'done', title: 'Done', icon: '●' },
];

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

function timeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BoardPage() {
  const router = useRouter();
  const { state: authState, dispatch: authDispatch } = useAuth();
  const { socket, isConnected } = useSocket();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [toast, setToast] = useState(null);

  const searchTimeout = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Auth guard
  useEffect(() => {
    if (!authState.user) {
      router.replace('/auth/login');
    }
  }, [authState.user, router]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [search]);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;

      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`${API_URL}/api/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        authDispatch({ type: 'LOGOUT' });
        router.replace('/auth/login');
        return;
      }

      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, authDispatch, router]);

  useEffect(() => {
    if (authState.user) {
      fetchTasks();
    }
  }, [authState.user, fetchTasks]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onTaskCreated = (task) => {
      setTasks((prev) => {
        if (prev.find((t) => t._id === task._id)) return prev;
        return [task, ...prev];
      });
      showToast('New task created');
    };

    const onTaskUpdated = (updatedTask) => {
      setTasks((prev) =>
        prev.map((t) => (t._id === updatedTask._id ? updatedTask : t))
      );
    };

    const onTaskDeleted = ({ id }) => {
      setTasks((prev) => prev.filter((t) => t._id !== id));
    };

    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:deleted', onTaskDeleted);

    return () => {
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:deleted', onTaskDeleted);
    };
  }, [socket]);

  // Toast
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Create task
  const handleCreateTask = async (title, description) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, description }),
      });

      const data = await res.json();
      if (res.ok && data.task) {
        // Socket will handle adding to state for other clients
        // but add immediately for this client
        setTasks((prev) => {
          if (prev.find((t) => t._id === data.task._id)) return prev;
          return [data.task, ...prev];
        });
        setShowCreateModal(false);
        showToast('Task created!');
      }
    } catch (err) {
      console.error('Create task error:', err);
    }
  };

  // Update task
  const handleUpdateTask = async (id, updates) => {
    try {
      const token = getToken();
      const task = tasks.find((t) => t._id === id);
      const res = await fetch(`${API_URL}/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...updates, updatedAt: task?.updatedAt }),
      });

      const data = await res.json();
      if (res.status === 409) {
        // Conflict — update local state with server version
        if (data.task) {
          setTasks((prev) => prev.map((t) => (t._id === data.task._id ? data.task : t)));
        }
        showToast('⚠️ Conflict: Task was updated by someone else');
        return;
      }

      if (res.ok && data.task) {
        setTasks((prev) => prev.map((t) => (t._id === data.task._id ? data.task : t)));
        setEditingTask(null);
      }
    } catch (err) {
      console.error('Update task error:', err);
    }
  };

  // Delete task
  const handleDeleteTask = async (id) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t._id !== id));
        setEditingTask(null);
        showToast('Task deleted');
      }
    } catch (err) {
      console.error('Delete task error:', err);
    }
  };

  // Drag & Drop
  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t._id === draggableId ? { ...t, status: newStatus } : t))
    );

    // Persist to backend
    handleUpdateTask(draggableId, { status: newStatus });
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authDispatch({ type: 'LOGOUT' });
    router.push('/');
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    return true;
  });

  const getColumnTasks = (columnId) => {
    return filteredTasks
      .filter((t) => t.status === columnId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  };

  if (!authState.user) {
    return (
      <div className="auth-container">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(15,15,35,0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            TaskFlow
          </h1>
          {/* Live indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20,
            background: isConnected ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
            border: `1px solid ${isConnected ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
          }}>
            <div className="pulse-dot" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isConnected ? 'var(--accent-green)' : 'var(--accent-rose)',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 500,
              color: isConnected ? 'var(--accent-green)' : 'var(--accent-rose)',
            }}>
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {authState.user.name}
          </span>
          <button onClick={handleLogout} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>
            Logout
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div style={{
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 250px', maxWidth: 360, position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-bar"
            style={{ paddingLeft: 36 }}
            id="search-input"
          />
        </div>

        {/* Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="filter-select"
          id="filter-status"
        >
          <option value="all">All Status</option>
          <option value="todo">Todo</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Create Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
          id="create-task-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Task
        </button>
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div className="spinner" style={{ width: 36, height: 36 }} />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            padding: '0 24px 40px',
            minHeight: '60vh',
          }}>
            {COLUMNS.map((col) => {
              const columnTasks = getColumnTasks(col.id);
              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      className={`board-column ${snapshot.isDraggingOver ? 'drop-active' : ''}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {/* Column Header */}
                      <div className="column-header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{col.icon}</span>
                            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                              {col.title}
                            </h2>
                          </div>
                          <span className={`count-badge count-${col.id}`}>
                            {columnTasks.length}
                          </span>
                        </div>
                      </div>

                      {/* Column Body */}
                      <div className="column-body" style={{ minHeight: 250 }}>
                        {columnTasks.length === 0 && !snapshot.isDraggingOver && (
                          <div className="empty-state">
                            <span style={{ fontSize: 32, marginBottom: 8 }}>
                              {col.id === 'todo' ? '📝' : col.id === 'in-progress' ? '⚙️' : '✅'}
                            </span>
                            <p style={{ fontSize: 13, margin: 0 }}>
                              {col.id === 'todo'
                                ? 'No tasks yet. Create one!'
                                : col.id === 'in-progress'
                                ? 'Drag tasks here to start'
                                : 'Completed tasks appear here'}
                            </p>
                          </div>
                        )}

                        {columnTasks.map((task, index) => (
                          <Draggable key={task._id} draggableId={task._id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`task-card ${snapshot.isDragging ? 'dragging' : ''}`}
                                onClick={() => setEditingTask(task)}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                  <h3 style={{
                                    fontSize: 14, fontWeight: 600, margin: 0,
                                    color: 'var(--text-primary)', lineHeight: 1.4,
                                    flex: 1, paddingRight: 8,
                                  }}>
                                    {task.title}
                                  </h3>
                                  <span className={`status-${task.status}`} style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 8px',
                                    borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.5px',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {task.status === 'in-progress' ? 'WIP' : task.status}
                                  </span>
                                </div>

                                {task.description && (
                                  <p style={{
                                    fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px',
                                    lineHeight: 1.5,
                                    display: '-webkit-box', WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                  }}>
                                    {task.description}
                                  </p>
                                )}

                                <div style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  fontSize: 11, color: 'var(--text-muted)',
                                }}>
                                  <span>{task.createdBy?.name || 'Unknown'}</span>
                                  <span>{timeAgo(task.updatedAt)}</span>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <TaskModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTask}
        />
      )}

      {/* Edit Modal */}
      {editingTask && (
        <EditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdate={(updates) => handleUpdateTask(editingTask._id, updates)}
          onDelete={() => handleDeleteTask(editingTask._id)}
        />
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ─── Create Task Modal ───────────────────────────
function TaskModal({ onClose, onSubmit }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onSubmit(title, description);
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px', color: 'var(--text-primary)' }}>
          Create New Task
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Title <span style={{ color: 'var(--accent-rose)' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="Enter task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              autoFocus
              required
              id="task-title-input"
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              placeholder="Add a description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              rows={3}
              style={{ resize: 'vertical', minHeight: 80 }}
              id="task-description-input"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || submitting} className="btn-primary">
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Task Modal ─────────────────────────────
function EditModal({ task, onClose, onUpdate, onDelete }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onUpdate({ title, description, status });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Edit Task
          </h2>
          <button onClick={onClose} className="btn-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
            id="edit-title-input"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field"
            rows={3}
            style={{ resize: 'vertical', minHeight: 80 }}
            id="edit-description-input"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="filter-select"
            style={{ width: '100%' }}
            id="edit-status-select"
          >
            <option value="todo">Todo</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* Meta info */}
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          marginBottom: 20, fontSize: 12, color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Created by</span>
            <span style={{ color: 'var(--text-secondary)' }}>{task.createdBy?.name || 'Unknown'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Last updated</span>
            <span style={{ color: 'var(--text-secondary)' }}>{new Date(task.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="btn-danger">
              Delete
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--accent-rose)' }}>Are you sure?</span>
              <button
                onClick={onDelete}
                className="btn-danger"
                style={{ background: 'var(--accent-rose)', color: 'white', border: 'none' }}
              >
                Yes, Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-icon" style={{ fontSize: 12 }}>
                Cancel
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!title.trim() || saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
