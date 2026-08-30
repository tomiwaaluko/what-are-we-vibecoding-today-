import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import SysTray from "systray2";

export type TrayBroker = {
  setPaused: (paused: boolean) => Promise<void>;
  getState: () => { paused: boolean; lastCard: { details: string } | null };
};

export function startTrayMenu(opts: {
  configPath: string;
  iconPath?: string;
  broker: TrayBroker;
  onQuit: () => Promise<void>;
}): SysTray {
  const icon = opts.iconPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.ico");
  const preview = opts.broker.getState().lastCard?.details ?? "No presence";
  const systray = new SysTray({
    menu: {
      icon,
      title: "Vibecoding",
      tooltip: "What are we vibecoding today",
      items: [
        { title: preview, tooltip: preview, enabled: false, checked: false },
        { title: "Pause", tooltip: "Pause Discord presence", enabled: true, checked: opts.broker.getState().paused },
        { title: "Open config", tooltip: "Open config.json", enabled: true, checked: false },
        { title: "Quit", tooltip: "Quit", enabled: true, checked: false },
      ],
    },
    debug: false,
    copyDir: true,
  });
  systray.onClick((action) => {
    if (action.seq_id === 1) {
      const next = !opts.broker.getState().paused;
      void opts.broker.setPaused(next).then(() => {
        void systray.sendAction({
          type: "update-item",
          item: { ...action.item, checked: next },
          seq_id: action.seq_id,
        });
      });
    }
    if (action.seq_id === 2) {
      spawn("cmd", ["/c", "start", "", opts.configPath], { detached: true, stdio: "ignore" }).unref();
    }
    if (action.seq_id === 3) {
      void opts.onQuit().then(() => process.exit(0));
    }
  });
  return systray;
}
