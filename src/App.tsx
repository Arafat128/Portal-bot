import { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Chat } from './components/Chat';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('chat_token');
      const storedUsername = localStorage.getItem('chat_username');
      if (storedToken && storedUsername) {
        setToken(storedToken);
        setUsername(storedUsername);
      }
    } catch (e) {
      console.error('localStorage is not available:', e);
    }
    setIsInitialized(true);
  }, []);

  const handleLogin = (newToken: string, newUsername: string) => {
    try {
      localStorage.setItem('chat_token', newToken);
      localStorage.setItem('chat_username', newUsername);
    } catch (e) {
      console.error('localStorage is not available:', e);
    }
    setToken(newToken);
    setUsername(newUsername);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('chat_token');
      localStorage.removeItem('chat_username');
    } catch (e) {
      console.error('localStorage is not available:', e);
    }
    setToken(null);
    setUsername(null);
  };

  if (!isInitialized) {
    return null; // Or a loading spinner
  }

  return (
    <>
      {token && username ? (
        <Chat token={token} username={username} onLogout={handleLogout} />
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </>
  );
}
