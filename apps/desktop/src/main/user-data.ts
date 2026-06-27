import path from "node:path";

type UserDataApp = {
  isPackaged: boolean;
  getPath(name: "appData"): string;
  setPath(name: "userData", path: string): void;
};

const DEV_USER_DATA_DIR_NAME = "Armin Dev";

export function configureUserDataPath(
  app: UserDataApp,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.ARMIN_DATA_DIR) {
    app.setPath("userData", env.ARMIN_DATA_DIR);
    return;
  }

  if (!app.isPackaged) {
    app.setPath(
      "userData",
      path.join(app.getPath("appData"), DEV_USER_DATA_DIR_NAME),
    );
  }
}
