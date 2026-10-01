import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Paths (env lido por chamada — override de teste nunca toca produção)
function missionStateDir(): string {
  return process.env.MISSION_STATE_DIR_OVERRIDE || '/root/.hermes/mission-state';
}
const HERMES_PLUGINS_DIR = '/root/.hermes/plugins';
const CLAUDE_CONFIG_DIR = path.join(HERMES_PLUGINS_DIR, 'mission-ops', '.claude-config', 'projects');

// Types
interface MissionState {
  missionId: string;
  status: string;
  paneId?: string;
  tabId?: string;
  lastEvent?: string;
  lastEventAt?: number;
}

interface HerdrPane {
  paneId: string;
  tabTitle: string;
  agent: string;
  agent_status: string;
}

interface SessionInfo {
  name: string;
  mtime: number;
}

interface RosterResult {
  missions: {
    [status: string]: Array<{
      missionId: string;
      paneId?: string;
      tabId?: string;
      lastEvent?: string;
      lastEventAt?: number;
      ageMinutes?: number;
    }>;
  };
  panes: HerdrPane[];
  sessions: {
    count: number;
    oldestMinutes: number;
    newestMinutes: number;
  };
  summary: {
    total_missions: number;
    by_status: { [status: string]: number };
    panes_alive: number;
    sessions_alive: number;
    staleness_flags: number;
  };
}


// Main function
export function getRoster(): RosterResult {
  const result: RosterResult = {
    missions: {},
    panes: [],
    sessions: { count: 0, oldestMinutes: 0, newestMinutes: 0 },
    summary: { total_missions: 0, by_status: {}, panes_alive: 0, sessions_alive: 0, staleness_flags: 0 }
  };

  // 1. Missions from ledger
  try {
    const stateDir = missionStateDir();
    const missionFiles = fs.readdirSync(stateDir);
    const now = Date.now();

    missionFiles.forEach(file => {
      if (!file.endsWith('.json')) return;

      try {
        const content = fs.readFileSync(path.join(stateDir, file), 'utf8');
        const state: MissionState = JSON.parse(content);

        // Skip invalid
        if (!state.missionId || !state.status) return;

        // Init status bucket
        if (!result.missions[state.status]) {
          result.missions[state.status] = [];
        }

        // Add mission with age
        const ageMs = state.lastEventAt ? now - state.lastEventAt : 0;
        const ageMinutes = Math.floor(ageMs / 60000);


        result.missions[state.status].push({
          missionId: state.missionId,
          paneId: state.paneId,
          tabId: state.tabId,
          lastEvent: state.lastEvent,
          lastEventAt: state.lastEventAt,
          ageMinutes
        });

        // Update summary
        result.summary.total_missions++;
        result.summary.by_status[state.status] = (result.summary.by_status[state.status] || 0) + 1;

        // Staleness flag for dispatched/working >15min
        if ((state.status === 'dispatched' || state.status === 'working') && ageMinutes > 15) {
          result.summary.staleness_flags++;
        }
      } catch (e) {
        // Skip malformed files
      }
    });
  } catch (e) {
    // Directory not accessible
  }

  // 2. Herdr panes via CLI (formato real: {"id","result":{"tabs":[...]}} — sem flag --json)
  try {
    const output = execSync('herdr tab list', { encoding: 'utf-8' });
    const parsed = JSON.parse(output);
    const tabs: Array<any> = parsed?.result?.tabs ?? (Array.isArray(parsed) ? parsed : []);

    result.panes = tabs.map((tab) => ({
      paneId: String(tab.tab_id ?? tab.id ?? ''),
      tabTitle: String(tab.label ?? tab.title ?? ''),
      agent: tab.agent?.name || 'unknown',
      agent_status: String(tab.agent_status ?? tab.status ?? 'unknown')
    }));

    result.summary.panes_alive = result.panes.length;
  } catch (e) {
    // herdr CLI not available
  }

  // 3. Claude sessions (metadata only)
  try {
    const sessionDirs = fs.readdirSync(CLAUDE_CONFIG_DIR);
    const sessions: SessionInfo[] = [];
    const now = Date.now();

    sessionDirs.forEach(dir => {
      try {
        const stat = fs.statSync(path.join(CLAUDE_CONFIG_DIR, dir));
        sessions.push({ name: dir, mtime: stat.mtimeMs });
      } catch (e) {
        // Skip inaccessible
      }
    });

    if (sessions.length > 0) {
      const sorted = sessions.sort((a, b) => a.mtime - b.mtime);
      const newestAge = (now - sorted[sorted.length - 1].mtime) / 60000;
      const oldestAge = (now - sorted[0].mtime) / 60000;

      result.sessions = {
        count: sessions.length,
        oldestMinutes: Math.floor(oldestAge),
        newestMinutes: Math.floor(newestAge)
      };

      result.summary.sessions_alive = sessions.length;
    }
  } catch (e) {
    // Directory not accessible
  }

  return result;
}