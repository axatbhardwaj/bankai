const NODESOURCE_SETUP_COMMAND =
	"curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -";

export const NODE_24_INSTALL_STEPS = [
	{
		args: ["bash", "-c", `set -o pipefail; ${NODESOURCE_SETUP_COMMAND}`],
		command: NODESOURCE_SETUP_COMMAND,
		error: "Could not configure the NodeSource Node.js 24 repository.",
	},
	{
		args: ["sudo", "apt-get", "install", "-y", "nodejs"],
		command: "sudo apt install -y nodejs",
		error: "Could not install Node.js 24.",
	},
];

export async function ensureNode24Runtime({
	readRuntimeImpl,
	isRuntimeSupported,
	runInstallStepImpl,
	installMessage,
	incompatibleMessage,
	logger,
}) {
	const current = await readRuntimeImpl();
	if (isRuntimeSupported(current)) return current;

	logger.info(
		typeof installMessage === "function"
			? installMessage(current)
			: installMessage,
	);
	for (const step of NODE_24_INSTALL_STEPS) {
		if (!(await runInstallStepImpl(step))) {
			logger.error(step.error);
			return null;
		}
	}

	const installed = await readRuntimeImpl();
	if (!isRuntimeSupported(installed)) {
		logger.error(incompatibleMessage(installed));
		return null;
	}
	return installed;
}
