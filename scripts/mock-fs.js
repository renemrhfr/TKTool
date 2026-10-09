// In-Memory-Ersatz fuer den Datenordner (File System Access API).
// Genutzt von scripts/screenshots.js und scripts/build-demo.js.
// Laeuft im Browser vor den App-Skripten. Methoden liegen am Prototyp,
// damit der Handle in IndexedDB passt (structured clone).
function installFakeFs(initialFiles) {
  const store = new Map(Object.entries(initialFiles));
  class FakeWritable {
    constructor(dir, name) { this.dir = dir; this.name = name; this.buf = ''; }
    async write(chunk) { this.buf += typeof chunk === 'string' ? chunk : await new Blob([chunk]).text(); }
    async close() { this.dir.files.set(this.name, this.buf); if (window.__mockOnWrite) window.__mockOnWrite(this.dir); }
    async abort() {}
  }
  class FakeFile {
    constructor(dir, name) { this.kind = 'file'; this.name = name; this.dir = dir; }
    async getFile() {
      const text = this.dir.files.get(this.name) ?? '';
      return new File([text], this.name, { type: 'application/json', lastModified: Date.now() });
    }
    async createWritable() { return new FakeWritable(this.dir, this.name); }
  }
  class FakeDir {
    constructor(name, files) { this.kind = 'directory'; this.name = name; this.files = files; this.dirs = new Map(); }
    async getFileHandle(name, opts = {}) {
      if (!this.files.has(name)) {
        if (!opts.create) throw new DOMException('not found', 'NotFoundError');
        this.files.set(name, '');
      }
      return new FakeFile(this, name);
    }
    async getDirectoryHandle(name) {
      if (!this.dirs.has(name)) this.dirs.set(name, new FakeDir(name, new Map()));
      return this.dirs.get(name);
    }
    async removeEntry(name) { this.files.delete(name); }
    async *values() { for (const name of this.files.keys()) yield new FakeFile(this, name); }
    async *entries() { for (const name of this.files.keys()) yield [name, new FakeFile(this, name)]; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(other) { return other === this; }
  }
  const dir = new FakeDir('tktool-mock', store);
  window.__mockDir = dir;
  window.showDirectoryPicker = async () => dir;
}

if (typeof module !== 'undefined') module.exports = { installFakeFs };
