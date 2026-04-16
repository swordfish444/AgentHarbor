const runnerPalette = [
  { solid: "#63b3ff", soft: "rgba(99, 179, 255, 0.18)" },
  { solid: "#ff8e5f", soft: "rgba(255, 142, 95, 0.18)" },
  { solid: "#70e2a7", soft: "rgba(112, 226, 167, 0.18)" },
  { solid: "#d8a7ff", soft: "rgba(216, 167, 255, 0.18)" },
  { solid: "#ffd36b", soft: "rgba(255, 211, 107, 0.18)" },
  { solid: "#7de1ff", soft: "rgba(125, 225, 255, 0.18)" },
  { solid: "#ff98c7", soft: "rgba(255, 152, 199, 0.18)" },
  { solid: "#8ff29d", soft: "rgba(143, 242, 157, 0.18)" },
] as const;

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

export const getRunnerColor = (runnerId: string) => runnerPalette[hashString(runnerId) % runnerPalette.length] ?? runnerPalette[0];
