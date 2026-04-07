const demoTeamLabels = ["student-team-a", "student-team-b"] as const;

const platformLabelMap: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

export const platformToDemoLabel = (platform: NodeJS.Platform) =>
  platformLabelMap[platform] ?? platform.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

export const buildDemoRunnerLabels = ({
  platform,
  runnerIndex,
  scenario,
  agentType,
}: {
  platform: NodeJS.Platform;
  runnerIndex: number;
  scenario: string;
  agentType: string;
}) => {
  const labels = new Set<string>([
    "demo",
    "backend",
    platformToDemoLabel(platform),
    demoTeamLabels[runnerIndex % demoTeamLabels.length],
    scenario,
    agentType,
  ]);

  if (runnerIndex % 2 === 0) {
    labels.add("lab-machine");
  }

  return [...labels];
};
