import * as core from "@actions/core";

import { Events, Inputs, Outputs, State } from "./constants";
import * as inputs from "./inputs";
import {
    IStateProvider,
    NullStateProvider,
    StateProvider
} from "./stateProvider";
import * as utils from "./utils/action";
import * as restore from "./utils/restore";

export async function restoreImpl(
    stateProvider: IStateProvider
): Promise<string | undefined> {
    try {
        core.setOutput(Outputs.Hit, false);
        core.setOutput(Outputs.HitPrimaryKey, false);
        core.setOutput(Outputs.HitFirstMatch, false);
        core.setOutput(Outputs.RestoredKey, false);
        core.setOutput(Outputs.RestoredKeys, []);

        if (!utils.isCacheFeatureAvailable()) {
            return;
        }

        // Validate inputs, this can cause task failure
        if (!utils.isValidEvent()) {
            throw new Error(
                `Event Validation Error: The event type ${
                    process.env[Events.Key]
                } is not supported because it's not tied to a branch or tag ref.`
            );
        }

        let restoredKey: string | undefined;
        let lookedUpKey: string | undefined;
        const restoredKeys: string[] = [];

        const errorNot = (message: string) =>
            new Error(
                `
                No cache with the given key ${message}.
                Exiting as the input "${Inputs.FailOn}" is set.
                `
            );

        const errorNotFound = errorNot("was found");
        const errorNotRestored = errorNot("could be restored");

        {
            const primaryKey = inputs.primaryKey;
            stateProvider.setState(State.CachePrimaryKey, primaryKey);

            utils.info(`Searching for a cache with the key "${primaryKey}".`);
            lookedUpKey = await utils.restoreCache({
                primaryKey,
                restoreKeys: [],
                lookupOnly: true
            });

            if (!lookedUpKey) {
                if (
                    inputs.failOn?.keyType == "primary" &&
                    inputs.failOn?.result == "miss"
                ) {
                    throw errorNotFound;
                } else {
                    utils.info(`Could not find a cache.`);
                }
            }

            if (lookedUpKey && utils.isExactKeyMatch(primaryKey, lookedUpKey)) {
                utils.info(
                    `Found a cache with the given "${Inputs.PrimaryKey}".`
                );
                core.setOutput(Outputs.HitPrimaryKey, true);

                if (!inputs.skipRestoreOnHitPrimaryKey) {
                    restoredKey = await restore.restoreCache(primaryKey);
                    if (restoredKey) {
                        restoredKeys.push(...[restoredKey]);
                    } else if (
                        inputs.failOn?.keyType == "primary" &&
                        inputs.failOn?.result == "not-restored"
                    ) {
                        throw errorNotRestored;
                    }
                }
            }
        }

        if (
            inputs.restorePrefixesFirstMatch.length > 0 &&
            !restoredKey &&
            !(inputs.skipRestoreOnHitPrimaryKey && lookedUpKey)
        ) {
            utils.info(
                `
                Searching for a cache using the "${
                    Inputs.RestorePrefixesFirstMatch
                }":
                ${JSON.stringify(inputs.restorePrefixesFirstMatch)}
                `
            );

            const foundKey = await utils.restoreCache({
                primaryKey: "",
                restoreKeys: inputs.restorePrefixesFirstMatch,
                lookupOnly: true
            });

            if (!foundKey) {
                if (
                    inputs.failOn?.keyType == "first-match" &&
                    inputs.failOn.result == "miss"
                ) {
                    throw errorNotFound;
                } else {
                    utils.info(`Could not find a cache.`);
                }
            }

            if (foundKey) {
                utils.info(
                    `Found a cache using the "${Inputs.RestorePrefixesFirstMatch}".`
                );
                core.setOutput(Outputs.HitFirstMatch, true);

                restoredKey = await restore.restoreCache(foundKey);
                if (restoredKey) {
                    restoredKeys.push(...[restoredKey]);
                } else if (
                    inputs.failOn?.keyType == "first-match" &&
                    inputs.failOn?.result == "not-restored"
                ) {
                    throw errorNotRestored;
                }
            }
        }

        if (!(inputs.skipRestoreOnHitPrimaryKey && lookedUpKey)) {
            restoredKeys.push(...(await restore.restoreCaches()));
        }

        restoredKey ||= "";

        // Store the matched cache key in states
        stateProvider.setState(State.CacheRestoredKey, restoredKey);

        core.setOutput(Outputs.Hit, true);
        core.setOutput(Outputs.RestoredKey, restoredKey);
        core.setOutput(Outputs.RestoredKeys, restoredKeys);

        return restoredKey;
    } catch (error: unknown) {
        core.setFailed((error as Error).message);
    }
}

async function run(
    stateProvider: IStateProvider,
    earlyExit: boolean | undefined
): Promise<void> {
    try {
        await restoreImpl(stateProvider);
    } catch (err) {
        console.error(err);
        if (earlyExit) {
            process.exit(1);
        }
    }

    // node will stay alive if any promises are not resolved,
    // which is a possibility if HTTP requests are dangling
    // due to retries or timeouts. We know that if we got here
    // that all promises that we care about have successfully
    // resolved, so simply exit with success.
    if (earlyExit) {
        process.exit(0);
    }
}

export async function restoreOnlyRun(
    earlyExit?: boolean | undefined
): Promise<void> {
    await run(new NullStateProvider(), earlyExit);
}

export async function restoreRun(
    earlyExit?: boolean | undefined
): Promise<void> {
    await run(new StateProvider(), earlyExit);
}
