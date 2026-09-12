import type { ClusterSnapshot, SamplePoint } from "../types";

const DB = "breath-hud";
const VER = 1;
const CLUSTERS = "clusters";

export interface StoredCluster {
  id: string;
  createdAt: number;
  updatedAt: number;
  samples: SamplePoint[];
  last: Pick<
    ClusterSnapshot,
    "bpm" | "amplitude" | "status" | "reason" | "avgBpm2min" | "avgAmp2min" | "trendBpmPerMin"
  >;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CLUSTERS)) {
        db.createObjectStore(CLUSTERS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertCluster(cl: ClusterSnapshot, samples: SamplePoint[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CLUSTERS, "readwrite");
    const store = tx.objectStore(CLUSTERS);
    const get = store.get(cl.id);
    get.onsuccess = () => {
      const prev = get.result as StoredCluster | undefined;
      const lastT = prev?.samples.length ? prev.samples[prev.samples.length - 1].t : 0;
      const add = samples.filter((s) => s.t > lastT);
      const rec: StoredCluster = {
        id: cl.id,
        createdAt: prev?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        samples: [...(prev?.samples ?? []), ...add].slice(-500),
        last: {
          bpm: cl.bpm,
          amplitude: cl.amplitude,
          status: cl.status,
          reason: cl.reason,
          avgBpm2min: cl.avgBpm2min,
          avgAmp2min: cl.avgAmp2min,
          trendBpmPerMin: cl.trendBpmPerMin,
        },
      };
      store.put(rec);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCluster(id: string): Promise<StoredCluster | null> {
  const db = await openDb();
  const rec = await new Promise<StoredCluster | undefined>((resolve, reject) => {
    const tx = db.transaction(CLUSTERS, "readonly");
    const req = tx.objectStore(CLUSTERS).get(id);
    req.onsuccess = () => resolve(req.result as StoredCluster | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec ?? null;
}

export async function listClusters(): Promise<StoredCluster[]> {
  const db = await openDb();
  const rows = await new Promise<StoredCluster[]>((resolve, reject) => {
    const tx = db.transaction(CLUSTERS, "readonly");
    const req = tx.objectStore(CLUSTERS).getAll();
    req.onsuccess = () => resolve((req.result as StoredCluster[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function exportJson(): Promise<string> {
  const rows = await listClusters();
  return JSON.stringify({ exportedAt: new Date().toISOString(), clusters: rows }, null, 2);
}

export function downloadText(filename: string, text: string, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
