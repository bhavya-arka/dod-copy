import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

export async function createTestApp() {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const { registerRoutes } = await import("../routes");
  await registerRoutes(app);

  return app;
}
