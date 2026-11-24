import { createClient } from '@libsql/client';

const client = createClient({
  url: 'https://comic-db-ngohoainamss1.aws-ap-southeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTUwMjUyNTIsImlkIjoiMDFhMWVmZDctNWQwMS03Nzg0LTg0ZWEtYzg3NjUxNDM5M2JhIiwia2lkIjoiUVRRcXJTblhDbWZtZUlxOUhWVjBEamc3OWlFd1RkN2VhcGtKVWRsN2laTSIsInJpZCI6ImE4OTdlMzQ1LTRkOTctNDUwOC05ZTNlLTllMzE0MmFlMDMwZCJ9.3D8GF5owsXvIKF0E3D8U_yc6XX74PMcQc7sQZPJceXYamMTLwowpO5-u64T47pFGbLgSYBBKmq9jANPGVElXCA',
});

async function main() {
  try {
    const res = await client.execute('SELECT id, code, title, target_url, is_active FROM spotlight_campaigns');
    console.log('Spotlights:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
