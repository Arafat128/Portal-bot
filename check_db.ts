import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function run() {
  const db = await open({
    filename: 'database.sqlite',
    driver: sqlite3.Database
  });
  const users = await db.all('SELECT * FROM users');
  console.log('Users:', users);
}
run();
