import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('No URI');
    return;
  }
  console.log('URI:', uri);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.close();
  }
}

test();
