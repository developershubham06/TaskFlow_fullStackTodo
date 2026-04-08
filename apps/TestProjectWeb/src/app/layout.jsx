import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'TaskFlow — Real-Time Task Board',
  description: 'A collaborative real-time task management board with drag & drop, live sync, and conflict resolution.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
