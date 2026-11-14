// Picking a Google Sheet for Import: it isn't a file (Android gives its Google type; iPhone and the web
// get a .gsheet shortcut that only links to it), so the app explains how to bring it in. (Picking the
// sheet itself can't work on a phone: through Android's file picker, Drive offers it only as a PDF.)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOOGLE_FILE_MESSAGE, isGoogleFile } from '@/db/exchange';

test('Google documents are told apart from real files', () => {
  assert.equal(isGoogleFile('application/vnd.google-apps.spreadsheet'), true, 'Android: by its type');
  assert.equal(isGoogleFile('application/vnd.google-apps.document'), true);
  assert.equal(isGoogleFile(null, 'My recommendations.gsheet'), true, 'iPhone / web: the shortcut file');
  assert.equal(isGoogleFile('application/octet-stream', 'Notes.gdoc'), true);
  assert.equal(isGoogleFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'list.xlsx'), false, 'a downloaded .xlsx');
  assert.equal(isGoogleFile('text/csv', 'sheet-export.csv'), false);
  assert.equal(isGoogleFile(undefined, 'gsheet.csv'), false, 'only the ending counts');
  assert.equal(isGoogleFile(undefined, undefined), false);
});

test('the message says how to bring it in (here as on an iPhone: the tests run as iOS)', () => {
  assert.match(GOOGLE_FILE_MESSAGE, /Settings → Google Sheet/);
  assert.match(GOOGLE_FILE_MESSAGE, /Send a copy → Excel/);
});
