import { IHydraDBDriver } from './interface.js';
import { LocalHydraDB } from './local/LocalHydraDB.js';
import { HydraDBCloud } from './cloud/HydraDBCloud.js';

export interface DriverOptions {
  mode?: 'local' | 'cloud';
  dbPath?: string;
  apiKey?: string;
  database?: string;
}

export function createHydraDBDriver(options?: DriverOptions): IHydraDBDriver {
  const modeSetting = options?.mode || process.env.TRACE_MODE;
  const apiKey = options?.apiKey || process.env.HYDRA_DB_API_KEY;

  if (modeSetting === 'cloud' || (apiKey && modeSetting !== 'local')) {
    return new HydraDBCloud({
      apiKey,
      database: options?.database,
      dbPath: options?.dbPath,
    });
  }

  return new LocalHydraDB({
    dbPath: options?.dbPath,
  });
}
