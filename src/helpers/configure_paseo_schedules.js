import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import prompts from "prompts";

import { log } from "../common/utils.js";
import { withLocalPaseoScheduleClient } from "./paseo_schedule_client.js";

const ROLE_IDS = ["staleArchive", "worktreeCleaner", "mergeReadiness"];

export const DEFAULT_PASEO_SCHEDULES_CONFIG = Object.freeze({
	version: 1,
	roles: {
		staleArchive: {
			scheduleId: null,
			provider: "claude",
			model: "claude-sonnet-5",
			thinkingOptionId: "high",
		},
		worktreeCleaner: {
			scheduleId: null,
			provider: "claude",
			model: "claude-sonnet-5",
			thinkingOptionId: "high",
		},
		mergeReadiness: {
			scheduleId: null,
			provider: "codex",
			model: "gpt-5.6-luna",
			thinkingOptionId: "high",
		},
	},
});

function schedulesConfigPath(home) {
	return path.join(home, ".config", "haoshoku", "paseo-schedules.json");
}

function validateNonEmptyString(value, field) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new TypeError(`${field} must be a non-empty string`);
	}
}

export function validatePaseoSchedulesConfig(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("root must be an object");
	}
	if (value.version !== 1) throw new TypeError("version must be 1");
	if (!value.roles || typeof value.roles !== "object") {
		throw new TypeError("roles must be an object");
	}
	const mappedIds = new Set();
	for (const roleId of ROLE_IDS) {
		const role = value.roles[roleId];
		if (!role || typeof role !== "object" || Array.isArray(role)) {
			throw new TypeError(`${roleId} must be an object`);
		}
		if (role.scheduleId !== null) {
			validateNonEmptyString(role.scheduleId, `${roleId}.scheduleId`);
			if (mappedIds.has(role.scheduleId)) {
				throw new TypeError(`duplicate schedule ID ${role.scheduleId}`);
			}
			mappedIds.add(role.scheduleId);
		}
		validateNonEmptyString(role.provider, `${roleId}.provider`);
		validateNonEmptyString(role.model, `${roleId}.model`);
		validateNonEmptyString(role.thinkingOptionId, `${roleId}.thinkingOptionId`);
		if (role.modeId !== undefined) {
			validateNonEmptyString(role.modeId, `${roleId}.modeId`);
		}
	}
	return value;
}

function writePrivateJson(file, value, fsImpl) {
	const directory = path.dirname(file);
	const stage = path.join(
		directory,
		`.${path.basename(file)}.stage-${process.pid}-${Date.now()}`,
	);
	fsImpl.mkdirSync(directory, { recursive: true });
	try {
		fsImpl.writeFileSync(stage, `${JSON.stringify(value, null, 2)}\n`, {
			mode: 0o600,
		});
		fsImpl.renameSync(stage, file);
		fsImpl.chmodSync(file, 0o600);
	} finally {
		fsImpl.rmSync(stage, { force: true });
	}
}

function writePrivateJsonExclusive(file, value, fsImpl) {
	const directory = path.dirname(file);
	const stage = path.join(
		directory,
		`.${path.basename(file)}.stage-${process.pid}-${Date.now()}`,
	);
	fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(directory, 0o700);
	try {
		fsImpl.writeFileSync(stage, `${JSON.stringify(value, null, 2)}\n`, {
			mode: 0o600,
			flag: "wx",
		});
		fsImpl.linkSync(stage, file);
		fsImpl.chmodSync(file, 0o600);
	} finally {
		fsImpl.rmSync(stage, { force: true });
	}
}

function readSchedulesConfig(home, fsImpl, logger) {
	const file = schedulesConfigPath(home);
	try {
		return validatePaseoSchedulesConfig(
			JSON.parse(fsImpl.readFileSync(file, "utf8")),
		);
	} catch (error) {
		logger.error(`Invalid ${file}; leaving it untouched (${error.message}).`);
		return null;
	}
}

export async function ensurePaseoSchedulesConfig({
	home = homedir(),
	fsImpl = fs,
	logger = log,
} = {}) {
	const file = schedulesConfigPath(home);
	if (!fsImpl.existsSync(file)) {
		writePrivateJson(file, DEFAULT_PASEO_SCHEDULES_CONFIG, fsImpl);
		return true;
	}
	try {
		return Boolean(readSchedulesConfig(home, fsImpl, logger));
	} catch {
		return false;
	}
}

export async function configurePaseoSchedules({
	home = homedir(),
	fsImpl = fs,
	logger = log,
	interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
	promptFn = prompts,
} = {}) {
	if (!(await ensurePaseoSchedulesConfig({ home, fsImpl, logger })))
		return false;
	if (!interactive) return true;
	const current = readSchedulesConfig(home, fsImpl, logger);
	if (!current) return false;
	const selection = await promptFn([
		{
			type: "multiselect",
			name: "roles",
			message: "Select Paseo schedule roles to configure",
			choices: [
				{ title: "Stale archive", value: "staleArchive" },
				{ title: "Worktree cleaner", value: "worktreeCleaner" },
				{ title: "Merge readiness", value: "mergeReadiness" },
			],
		},
	]);
	if (!Array.isArray(selection.roles)) return false;
	if (selection.roles.length === 0) return true;
	const next = structuredClone(current);
	for (const roleId of selection.roles) {
		if (!ROLE_IDS.includes(roleId)) {
			logger.error(
				`Unknown Paseo schedule role ${roleId}; leaving config unchanged.`,
			);
			return false;
		}
		const role = current.roles[roleId];
		const answer = await promptFn([
			{
				type: "text",
				name: "scheduleId",
				message: `${roleId} schedule ID (empty leaves it unmapped)`,
				initial: role.scheduleId ?? "",
			},
			{
				type: "text",
				name: "provider",
				message: `${roleId} provider ID`,
				initial: role.provider,
			},
			{
				type: "text",
				name: "model",
				message: `${roleId} model ID`,
				initial: role.model,
			},
			{
				type: "text",
				name: "thinkingOptionId",
				message: `${roleId} reasoning effort ID`,
				initial: role.thinkingOptionId,
			},
			{
				type: "text",
				name: "modeId",
				message: `${roleId} mode ID (empty preserves the current mode)`,
				initial: role.modeId ?? "",
			},
		]);
		for (const field of [
			"scheduleId",
			"provider",
			"model",
			"thinkingOptionId",
			"modeId",
		]) {
			if (typeof answer[field] !== "string") {
				logger.error(`Configuration cancelled; leaving config unchanged.`);
				return false;
			}
		}
		next.roles[roleId] = {
			scheduleId: answer.scheduleId.trim() || null,
			provider: answer.provider.trim(),
			model: answer.model.trim(),
			thinkingOptionId: answer.thinkingOptionId.trim(),
		};
		if (answer.modeId.trim()) {
			next.roles[roleId].modeId = answer.modeId.trim();
		}
	}
	try {
		validatePaseoSchedulesConfig(next);
		writePrivateJson(schedulesConfigPath(home), next, fsImpl);
		logger.success("Paseo schedule mappings configured.");
		return true;
	} catch (error) {
		logger.error(`Could not update Paseo schedule config (${error.message}).`);
		return false;
	}
}

function ownedChanges(current, desired) {
	const changes = {};
	for (const field of ["provider", "model", "thinkingOptionId"]) {
		if (current[field] !== desired[field]) {
			changes[field] = { from: current[field] ?? null, to: desired[field] };
		}
	}
	if (desired.modeId !== undefined && current.modeId !== desired.modeId) {
		changes.modeId = { from: current.modeId ?? null, to: desired.modeId };
	}
	return changes;
}

async function loadCapabilities(client, providers) {
	const snapshot = await client.getProvidersSnapshot();
	const byProvider = new Map();
	for (const provider of providers) {
		const entry = snapshot.entries?.find((item) => item.provider === provider);
		const [modelsResult, modesResult] = await Promise.all([
			client.listProviderModels(provider),
			client.listProviderModes(provider),
		]);
		byProvider.set(provider, {
			entry,
			models: modelsResult.models ?? [],
			modelsError: modelsResult.error ?? null,
			modes: modesResult.modes ?? [],
			modesError: modesResult.error ?? null,
		});
	}
	return byProvider;
}

function capabilityErrors(desired, capabilities) {
	const errors = [];
	if (
		!capabilities.entry ||
		capabilities.entry.enabled === false ||
		capabilities.entry.status !== "ready"
	) {
		errors.push(`provider ${desired.provider} is not ready and enabled`);
	}
	if (capabilities.modelsError) {
		errors.push(`could not load models: ${capabilities.modelsError}`);
	}
	const model = capabilities.models.find(({ id }) => id === desired.model);
	if (!model || model.isSelectable === false) {
		errors.push(`model ${desired.model} is not supported`);
	} else if (
		!(model.thinkingOptions ?? []).some(
			({ id }) => id === desired.thinkingOptionId,
		)
	) {
		errors.push(
			`effort ${desired.thinkingOptionId} is not supported by ${desired.model}`,
		);
	}
	if (capabilities.modesError) {
		errors.push(`could not load modes: ${capabilities.modesError}`);
	}
	if (
		desired.modeId !== undefined &&
		!capabilities.modes.some(({ id }) => id === desired.modeId)
	) {
		errors.push(`mode ${desired.modeId} is not supported`);
	}
	return errors;
}

async function buildSchedulePlan({ home, fsImpl, logger, client }) {
	const config = readSchedulesConfig(home, fsImpl, logger);
	if (!config) return { ok: false, targets: [] };
	const mappedRoleIds = ROLE_IDS.filter(
		(roleId) => config.roles[roleId].scheduleId !== null,
	);
	if (mappedRoleIds.length === 0) {
		return {
			ok: true,
			targets: ROLE_IDS.map((roleId) => ({
				roleId,
				scheduleId: null,
				status: "skipped",
				changes: {},
				errors: [],
			})),
		};
	}
	const providers = [
		...new Set(mappedRoleIds.map((id) => config.roles[id].provider)),
	];
	let capabilities;
	try {
		capabilities = await loadCapabilities(client, providers);
	} catch (error) {
		return {
			ok: false,
			error: `Could not load capabilities (${error.message}).`,
			targets: [],
		};
	}
	const targets = [];
	for (const roleId of ROLE_IDS) {
		const desired = config.roles[roleId];
		if (desired.scheduleId === null) {
			targets.push({
				roleId,
				scheduleId: null,
				status: "skipped",
				changes: {},
				errors: [],
			});
			continue;
		}
		const errors = capabilityErrors(
			desired,
			capabilities.get(desired.provider),
		);
		let schedule;
		try {
			const inspected = await client.scheduleInspect({
				id: desired.scheduleId,
			});
			if (inspected.error || !inspected.schedule) {
				throw new Error(inspected.error ?? "schedule was not found");
			}
			schedule = inspected.schedule;
		} catch (error) {
			errors.push(`could not inspect ${desired.scheduleId}: ${error.message}`);
			targets.push({
				roleId,
				scheduleId: desired.scheduleId,
				status: "error",
				errors,
			});
			continue;
		}
		if (schedule.target?.type !== "new-agent") {
			errors.push(`${desired.scheduleId} is not a new-agent schedule`);
		}
		const current = schedule.target?.config ?? {};
		if (current.provider !== desired.provider && desired.modeId === undefined) {
			errors.push(
				`provider change for ${desired.scheduleId} requires an explicit modeId`,
			);
		}
		const providerCapabilities = capabilities.get(desired.provider);
		const effectiveModeId =
			desired.modeId ??
			current.modeId ??
			providerCapabilities.entry?.defaultModeId ??
			null;
		if (
			current.provider === desired.provider &&
			(effectiveModeId === null ||
				!providerCapabilities.modes.some(({ id }) => id === effectiveModeId))
		) {
			errors.push(
				`preserved mode ${effectiveModeId ?? "(default)"} is not supported`,
			);
		}
		const changes = ownedChanges(current, desired);
		targets.push({
			roleId,
			scheduleId: desired.scheduleId,
			status:
				errors.length > 0
					? "error"
					: Object.keys(changes).length > 0
						? "change"
						: "unchanged",
			changes,
			errors,
			capabilities: {
				provider: providerCapabilities.entry?.status ?? "missing",
				model: providerCapabilities.models.some(
					({ id, isSelectable }) =>
						id === desired.model && isSelectable !== false,
				)
					? "supported"
					: "unsupported",
				effort: providerCapabilities.models
					.find(({ id }) => id === desired.model)
					?.thinkingOptions?.some(({ id }) => id === desired.thinkingOptionId)
					? "supported"
					: "unsupported",
				modeId: effectiveModeId,
				mode: providerCapabilities.modes.some(
					({ id }) => id === effectiveModeId,
				)
					? "supported"
					: "unsupported",
			},
			original: schedule,
			desired,
		});
	}
	return {
		ok: targets.every(({ status }) => status !== "error"),
		targets,
	};
}

export async function checkPaseoSchedules({
	home = homedir(),
	fsImpl = fs,
	logger = log,
	client,
} = {}) {
	return buildSchedulePlan({ home, fsImpl, logger, client });
}

export async function applyPaseoSchedules({
	home = homedir(),
	fsImpl = fs,
	logger = log,
	client,
	backupDirectory = path.join(
		home,
		".config",
		"haoshoku",
		"paseo-schedule-backups",
	),
	now = () => new Date(),
	randomSuffix = randomUUID,
} = {}) {
	const plan = await buildSchedulePlan({ home, fsImpl, logger, client });
	if (!plan.ok) {
		return {
			...plan,
			applied: [],
			attempted: [],
			uncertain: [],
			backupPath: null,
		};
	}
	if (!plan.targets.some(({ status }) => status === "change")) {
		return {
			...plan,
			applied: [],
			attempted: [],
			uncertain: [],
			backupPath: null,
		};
	}
	const timestamp = now().toISOString();
	const backupPath = path.join(
		backupDirectory,
		`paseo-schedules-${timestamp.replaceAll(":", "-")}-${randomSuffix()}.json`,
	);
	try {
		writePrivateJsonExclusive(
			backupPath,
			{
				version: 1,
				createdAt: timestamp,
				schedules: plan.targets
					.filter(({ original }) => original)
					.map(({ original }) => original),
			},
			fsImpl,
		);
	} catch (error) {
		return {
			...plan,
			ok: false,
			applied: [],
			attempted: [],
			uncertain: [],
			backupPath: null,
			error: `Could not create an exclusive private backup (${error.message}); no schedule updates were attempted.`,
		};
	}
	const applied = [];
	const attempted = [];
	const uncertain = [];
	for (const target of plan.targets.filter(
		({ status }) => status === "change",
	)) {
		try {
			const beforeWrite = await inspectSchedule(client, target.scheduleId);
			if (
				!isDeepStrictEqual(
					scheduleFingerprint(beforeWrite),
					scheduleFingerprint(target.original),
				)
			) {
				throw new Error(
					"schedule changed after preview; no update was attempted",
				);
			}
			const newAgentConfig = Object.fromEntries(
				Object.keys(target.changes).map((field) => [
					field,
					target.desired[field],
				]),
			);
			attempted.push(target.roleId);
			uncertain.push(target.roleId);
			const updated = await client.scheduleUpdate({
				id: target.scheduleId,
				newAgentConfig,
			});
			if (updated.error) throw new Error(updated.error);
			const readback = await inspectSchedule(client, target.scheduleId);
			verifyScheduleReadback(target, readback);
			uncertain.pop();
			applied.push(target.roleId);
		} catch (error) {
			const retryGuidance = uncertain.includes(target.roleId)
				? ` State is uncertain; inspect ${target.scheduleId} before retrying. No automatic retry was attempted.`
				: " No API write was attempted for this target.";
			return {
				...plan,
				ok: false,
				partial: attempted.length > 0,
				applied,
				attempted,
				uncertain,
				backupPath,
				error: `${target.roleId} was not safely applied (${error.message}).${retryGuidance} Backup: ${backupPath}`,
			};
		}
	}
	return { ...plan, applied, attempted, uncertain, backupPath };
}

async function inspectSchedule(client, id) {
	const result = await client.scheduleInspect({ id });
	if (result.error || !result.schedule) {
		throw new Error(result.error ?? `schedule ${id} was not found`);
	}
	return result.schedule;
}

function scheduleFingerprint(schedule) {
	const config = { ...schedule.target?.config };
	return {
		id: schedule.id,
		name: schedule.name,
		prompt: schedule.prompt,
		cadence: schedule.cadence,
		target: { type: schedule.target?.type, config },
		status: schedule.status,
		createdAt: schedule.createdAt,
		pausedAt: schedule.pausedAt,
		expiresAt: schedule.expiresAt,
		maxRuns: schedule.maxRuns,
	};
}

function protectedSchedule(schedule) {
	const fingerprint = scheduleFingerprint(schedule);
	if (fingerprint.target.type === "new-agent") {
		for (const field of ["provider", "model", "modeId", "thinkingOptionId"]) {
			delete fingerprint.target.config[field];
		}
	}
	return fingerprint;
}

function verifyScheduleReadback(target, readback) {
	if (
		!isDeepStrictEqual(
			protectedSchedule(readback),
			protectedSchedule(target.original),
		)
	) {
		throw new Error("readback changed fields outside Haoshoku ownership");
	}
	const expected = { ...target.original.target.config };
	for (const field of Object.keys(target.changes)) {
		expected[field] = target.desired[field];
	}
	for (const field of ["provider", "model", "modeId", "thinkingOptionId"]) {
		if ((readback.target.config[field] ?? null) !== (expected[field] ?? null)) {
			throw new Error(`readback did not preserve expected ${field}`);
		}
	}
}

function reportSchedulePlan(result, logger) {
	for (const target of result.targets ?? []) {
		if (target.status === "skipped") {
			logger.info(`${target.roleId}: skipped (unmapped)`);
			continue;
		}
		const capabilityText = target.capabilities
			? `provider=${target.capabilities.provider}, model=${target.capabilities.model}, effort=${target.capabilities.effort}, mode=${target.capabilities.modeId ?? "(default)"} ${target.capabilities.mode}`
			: "capabilities unavailable";
		logger.info(
			`${target.roleId}: ${target.status} (${target.scheduleId}); ${capabilityText}`,
		);
		for (const [field, change] of Object.entries(target.changes ?? {})) {
			logger.info(`  ${field}: ${change.from ?? "(unset)"} -> ${change.to}`);
		}
		for (const error of target.errors ?? []) logger.error(`  ${error}`);
	}
	if (result.error) logger.error(result.error);
	if (result.backupPath) logger.info(`Schedule backup: ${result.backupPath}`);
}

export async function runPaseoSchedules(
	mode,
	{
		home = homedir(),
		fsImpl = fs,
		logger = log,
		withClientImpl = withLocalPaseoScheduleClient,
		...options
	} = {},
) {
	const config = readSchedulesConfig(home, fsImpl, logger);
	if (!config) return { ok: false, targets: [] };
	const hasMappings = ROLE_IDS.some(
		(roleId) => config.roles[roleId].scheduleId !== null,
	);
	const execute = (client) =>
		mode === "apply"
			? applyPaseoSchedules({ home, fsImpl, logger, client, ...options })
			: checkPaseoSchedules({ home, fsImpl, logger, client });
	let result;
	try {
		result = hasMappings
			? await withClientImpl(execute, {
					home: path.join(home, ".paseo"),
					...options,
				})
			: await execute(undefined);
	} catch (error) {
		result = { ok: false, error: error.message, targets: [] };
	}
	reportSchedulePlan(result, logger);
	return result;
}
