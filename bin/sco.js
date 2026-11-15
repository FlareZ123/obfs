'use strict';
const { createScoServer } = require('../lib/sco-server');
try {
  const token = process.env.OBFS_SCO_TOKEN;
  const port = Number(process.env.OBFS_SCO_PORT || 8787);
  const server = createScoServer({ token });
  server.listen(port, '127.0.0.1', () => console.log(`SCO builder listening on 127.0.0.1:${port}`));
} catch (error) { console.error(error.message); process.exitCode = 1; }
