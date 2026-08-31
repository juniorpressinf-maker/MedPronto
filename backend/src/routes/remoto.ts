import { Router } from "express";
import QRCode from "qrcode";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  getTunnelStatus,
  startCloudflaredTunnel,
  stopCloudflaredTunnel,
} from "../utils/cloudflareTunnel.js";
import { localIPv4s } from "../utils/localNetwork.js";

export const remotoRouter = Router();

remotoRouter.use(requireAuth(), requireModulo("remoto"));

remotoRouter.get(
  "/network",
  asyncHandler(async (_req, res) => {
    const port = config.port;
    const ips = localIPv4s();
    const links = await Promise.all(
      ips.map(async (ip) => {
        const url = `http://${ip.address}:${port}`;
        const qrSvg = await QRCode.toString(url, {
          type: "svg",
          margin: 1,
          width: 180,
        });
        return { ...ip, url, qrSvg };
      }),
    );
    res.json({ port, links });
  }),
);

remotoRouter.get(
  "/tunnel/status",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, ...getTunnelStatus() });
  }),
);

remotoRouter.post(
  "/tunnel/start",
  asyncHandler(async (_req, res) => {
    const st = startCloudflaredTunnel(config.port);
    if (!st.binaryFound) {
      res.status(400).json({
        ok: false,
        error: st.lastError,
        erro: st.lastError,
        ...st,
      });
      return;
    }
    res.json({ ok: true, ...st });
  }),
);

remotoRouter.post(
  "/tunnel/stop",
  asyncHandler(async (_req, res) => {
    const st = stopCloudflaredTunnel();
    res.json({ ok: true, ...st });
  }),
);
