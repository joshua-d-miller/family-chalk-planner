/*
===============================================================================
 Family Chalk Planner | Tests | sample-pictures.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-24

 Purpose:
     Tiny real pictures (2 × 2, red) for the tests and the stand-in servers.
     The board draws every picture from elsewhere again before keeping it
     (server/images.ts), so a test picture has to be a whole one, not just
     the first few bytes of one.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.2.8     2026-11-24   joshua    New file.
                        claude
===============================================================================
*/

const b64 = (s: string) => Buffer.from(s, 'base64');
export const GIF = b64('R0lGODlhAgACAIAAAExpccwzMyH5BAUAAAAALAAAAAACAAIAAAICjFMAOw==');
export const PNG = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWM4Y2x8xtiYAUIBACPqBMlwUmUNAAAAAElFTkSuQmCC'
);
export const JPEG = b64(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWAAqu/9k='
);
export const WEBP = b64('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQmTJ3pv+BiOh/AAA=');
