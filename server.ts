import express from 'express';
import cors from 'cors';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Initialize SQLite Database
  const db = await open({
    filename: path.join(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      content TEXT,
      sender TEXT, -- 'user' or 'admin'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Initialize Discord Bot
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let discordChannel: TextChannel | null = null;

  if (process.env.DISCORD_BOT_TOKEN) {
    discordClient.once('ready', async () => {
      console.log(`Discord bot logged in as ${discordClient.user?.tag}`);
      if (process.env.DISCORD_CHANNEL_ID) {
        try {
          const channel = await discordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID);
          if (channel?.isTextBased()) {
            discordChannel = channel as TextChannel;
            console.log(`Bound to Discord channel: ${discordChannel.name}`);
          }
        } catch (error) {
          console.error('Failed to fetch Discord channel:', error);
        }
      }
    });

    discordClient.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;
      
      // Only listen in the configured channel
      if (message.channelId !== process.env.DISCORD_CHANNEL_ID) return;

      // Command format: !reply <username> <message>
      if (message.content.startsWith('!reply ')) {
        const contentAfterCommand = message.content.slice('!reply '.length).trim();
        
        try {
          const users = await db.all('SELECT id, username FROM users');
          let matchedUser = null;
          let replyContent = '';

          // Sort users by username length descending to match the longest possible username first
          users.sort((a, b) => b.username.length - a.username.length);

          for (const user of users) {
            if (contentAfterCommand.toLowerCase().startsWith(user.username.toLowerCase())) {
              // Check if the next character is a space or end of string to avoid partial matches
              const nextChar = contentAfterCommand[user.username.length];
              if (nextChar === ' ' || nextChar === undefined) {
                matchedUser = user;
                replyContent = contentAfterCommand.slice(user.username.length).trim();
                break;
              }
            }
          }

          if (!matchedUser) {
            // Fallback to the first word if no user matched
            const firstWord = contentAfterCommand.split(' ')[0];
            message.reply(`User \`${firstWord}\` not found.`);
            return;
          }

          if (!replyContent) {
            message.reply('Please provide a message to send.');
            return;
          }

          await db.run(
            'INSERT INTO messages (user_id, content, sender) VALUES (?, ?, ?)',
            [matchedUser.id, replyContent, 'admin']
          );

          message.react('✅'); // React with checkmark
        } catch (error) {
          console.error('Error handling Discord reply:', error);
          message.reply('An error occurred while sending the reply.');
        }
      }
    });

    discordClient.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
      console.error('Failed to login to Discord:', err);
    });

    // Graceful shutdown to prevent multiple bot instances during dev server restarts
    const shutdown = () => {
      console.log('Shutting down, destroying Discord client...');
      discordClient.destroy();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else {
    console.warn('DISCORD_BOT_TOKEN is not set. Discord integration is disabled.');
  }

  // API Routes
  
  // Middleware to authenticate JWT
  const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.status(401).json({ error: 'No token provided' });

    try {
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
          console.error('JWT verify failed:', err);
          return res.status(401).json({ error: 'Invalid token' });
        }
        (req as any).user = user;
        next();
      });
    } catch (error) {
      console.error('JWT verify error:', error);
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  app.post('/api/register', async (req, res) => {
    try {
      let { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      username = username.trim();
      if (username.includes(' ')) {
        return res.status(400).json({ error: 'Username cannot contain spaces' });
      }

      const existingUser = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists. Please choose another one.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
      
      const token = jwt.sign({ id: result.lastID, username }, JWT_SECRET);
      res.json({ token, username });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      let { username, password } = req.body;
      username = username?.trim();
      const user = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username]);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
      res.json({ token, username: user.username });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const messages = await db.all('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC', [userId]);
      res.json(messages);
    } catch (error) {
      console.error('Fetch messages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const username = (req as any).user.username;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const result = await db.run(
        'INSERT INTO messages (user_id, content, sender) VALUES (?, ?, ?)',
        [userId, content, 'user']
      );

      const newMessage = await db.get('SELECT * FROM messages WHERE id = ?', [result.lastID]);

      // Send to Discord
      if (discordChannel) {
        discordChannel.send(`**[Website User: ${username}]**\n${content}`).catch(err => {
          console.error('Failed to send message to Discord:', err);
        });
      }

      res.json(newMessage);
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
