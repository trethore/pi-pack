import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const testHome = mkdtempSync(path.join(tmpdir(), 'pi-pack-test-home-'));

process.env.HOME = testHome;
process.env.USERPROFILE = testHome;
