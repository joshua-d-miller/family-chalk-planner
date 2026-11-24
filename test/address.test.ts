/*
===============================================================================
 Family Chalk Planner | Tests | address.test.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-24

 Purpose:
     The one check every fetched address goes through (server/address.ts):
     home-network servers and iCloud's own servers pass; addresses with a
     password in them, other kinds of link and addresses no real server
     has never do; "Add from link" also keeps to the public internet.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New file.
                        claude
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { checkedAddress, ipv4Inside, unusableIp } from '../server/address.ts';
import { privateIp } from '../server/media.ts';

test('Immich and calendar servers: your own network and the internet both work', () => {
  for (const u of [
    'http://192.168.1.50:2283/api/albums',
    'http://10.0.0.5:5232/dav/',
    'http://immich.local:2283/api',
    'http://127.0.0.1:5232/',
    'https://caldav.icloud.com/',
    'https://p52-caldav.icloud.com/123456/calendars/',
    'http://[fd00::5]:2283/api'
  ])
    assert.ok(checkedAddress(u), u);
  assert.equal(checkedAddress('https://caldav.icloud.com'), 'https://caldav.icloud.com/', 'tidied by the URL parser');
});

test('never: a password in the address, other kinds of link, or an address no server has', () => {
  for (const u of [
    'http://user:secret@192.168.1.50:2283/',
    'http://:secret@example.com/',
    'file:///etc/passwd',
    'ftp://example.com/',
    'javascript:alert(1)',
    'not a link',
    '',
    'http://169.254.169.254/latest/meta-data/', // where cloud servers keep their secrets
    'http://0.0.0.0:2283/',
    'http://[::]:2283/',
    'http://[fe80::1]/',
    'http://224.0.0.1/',
    'http://[::ffff:169.254.169.254]/'
  ])
    assert.equal(checkedAddress(u), null, u);
  assert.ok(unusableIp('169.254.1.1') && !unusableIp('192.168.1.1') && !unusableIp('8.8.8.8'));
});

test('an IPv4 address written as IPv6 is checked as that address', () => {
  for (const [v6, v4] of [
    ['::ffff:7f00:1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['[::ffff:a9fe:a9fe]', '169.254.169.254'],
    ['0:0:0:0:0:ffff:c0a8:101', '192.168.1.1'],
    ['::ffff:0:7f00:1', '127.0.0.1'],
    ['64:ff9b::a00:1', '10.0.0.1'],
    ['::7f00:1', '127.0.0.1']
  ])
    assert.equal(ipv4Inside(v6), v4, v6);
  for (const v of ['::1', '::', 'fd00::5', '2001:db8::1', '127.0.0.1']) assert.equal(ipv4Inside(v), null, v);
  // "Add from link" (server/media.ts): none of these reach the board's own computer or your network any more
  for (const u of ['::ffff:7f00:1', '::ffff:c0a8:101', '64:ff9b::a00:1', '::ffff:0:a00:1'])
    assert.equal(privateIp(u), true, u);
  assert.equal(privateIp('::ffff:808:808'), false, '8.8.8.8 is public');
});

test('"Add from link": the public internet only, on the usual ports', () => {
  const link = (u: string) => checkedAddress(u, { publicOnly: true, isPrivate: privateIp });
  assert.ok(link('https://media.giphy.com/media/abc/giphy.gif'));
  assert.ok(link('http://8.8.8.8/a.gif'));
  for (const u of [
    'http://192.168.1.10/a.gif',
    'http://127.0.0.1/a.gif',
    'http://[::1]/a.gif',
    'https://example.com:8443/a.gif'
  ])
    assert.equal(link(u), null, u);
});
