import { Request, Response, NextFunction } from 'express';
import { RuntimeTracer } from './tracer.js';

export function traceExpressMiddleware() {
  const tracer = RuntimeTracer.getInstance();

  return (req: Request, res: Response, next: NextFunction) => {
    const routeName = `${req.method} ${req.path}`;

    tracer.startTrace(
      routeName,
      { route: req.path, method: req.method },
      () => {
        const cleanup = () => {
          res.removeListener('finish', cleanup);
          res.removeListener('close', cleanup);
        };

        res.on('finish', cleanup);
        res.on('close', cleanup);

        next();
      }
    );
  };
}
