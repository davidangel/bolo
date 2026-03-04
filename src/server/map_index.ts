import * as fs from 'fs';
import * as path from 'path';

interface MapDescr {
  name: string;
  path: string;
}

class MapIndex {
  mapPath: string;
  nameIndex: Record<string, MapDescr> = {};
  fuzzyIndex: Record<string, MapDescr> = {};

  constructor(mapPath: string, callback?: () => void) {
    this.mapPath = mapPath;
    this.reindex(callback);
  }

  reindex(callback?: () => void): void {
    const names: Record<string, MapDescr> = {};
    const fuzzy: Record<string, MapDescr> = {};
    this.nameIndex = names;
    this.fuzzyIndex = fuzzy;

    const index = (file: string, cb?: () => void): void => {
      fs.stat(file, (err, stats) => {
        if (err) {
          console.log(err.toString());
          cb?.();
          return;
        }
        if (stats.isDirectory()) {
          fs.readdir(file, (err, subfiles) => {
            if (err) {
              console.log(err.toString());
              cb?.();
              return;
            }
            let counter = subfiles.length;
            if (counter === 0) { cb?.(); return; }
            for (const subfile of subfiles) {
              index(path.join(file, subfile), () => {
                if (--counter === 0) { cb?.(); }
              });
            }
          });
        } else {
          const m = /([^/]+?)\.map$/i.exec(file);
          if (m) {
            const descr: MapDescr = { name: m[1], path: file };
            names[descr.name] = descr;
            fuzzy[descr.name.replace(/[\W_]+/g, '')] = descr;
          }
          cb?.();
        }
      });
    };

    index(this.mapPath, callback);
  }

  get(name: string): MapDescr | undefined {
    return this.nameIndex[name];
  }

  fuzzy(s: string): MapDescr[] {
    const input = s.replace(/[\W_]+/g, '');
    const matcher = new RegExp(input, 'i');
    const results: MapDescr[] = [];
    for (const fuzzed in this.fuzzyIndex) {
      const descr = this.fuzzyIndex[fuzzed];
      if (fuzzed === input) {
        return [descr];
      } else if (matcher.test(fuzzed)) {
        results.push(descr);
      }
    }
    return results;
  }
}


//# Exports
export default MapIndex;
