import {Stage, MessageStateType} from "./Stage";
import {useEffect, useState} from "react";
import {DEFAULT_INITIAL, DEFAULT_MESSAGE, Message} from "@chub-ai/stages-ts";

// Modify this JSON to include whatever character/user information you want to test.
// Currently: the Corruption System card (generated from 'Corruption System.json' at repo root).
import InitData from './assets/test-init.json';

/***
 This is a testing class for running a stage locally, outside an active chat.
 The main thing to modify is runTests() below.
 Spreading DEFAULT_INITIAL / DEFAULT_MESSAGE keeps the runner working
 across library version bumps (forward-compat by design).
 ***/
export const TestStageRunner = ({factory}: {factory: (data: unknown) => Stage}) => {

    const [stage] = useState(factory({...DEFAULT_INITIAL, ...InitData}));

    // This is what forces the stage node to re-render.
    const [node, setNode] = useState(new Date());

    function refresh() {
        setNode(new Date());
    }

    const botMsg = (content: string): Message => ({...DEFAULT_MESSAGE, anonymizedId: "1", content, isBot: true});

    /***
     Drives the stage through a realistic message sequence:
     first message (no stats) → target proposal → stat lines → completion
     → prompt re-injection → branch-jump restore.
     ***/
    async function runTests() {
        const cs = InitData.characters["1"];
        let r = await stage.afterResponse(botMsg(cs.first_message));
        console.assert(r.messageState?.target == null, 'first message: no target');
        console.assert(r.messageState?.stats == null, 'first message: no stats (prose mentions, not a stat line)');

        r = await stage.afterResponse(botMsg("Here is the intended target:\n**NAME:{Victoria}**\n**AGE:{20}**\n**Occupation:{Student}**\n**APPEARANCE: [[Girl, 170cm tall, bra cup size B, green eyes, wears glasses.]]**\nDo you approve this target?"));
        const t = r.messageState;
        console.assert(t?.target?.name === 'Victoria', 'name parsed, got: ' + JSON.stringify(t?.target));
        console.assert(t?.target?.age === 20, 'age parsed');
        console.assert(t?.target?.occupation === 'Student', 'occupation parsed (mixed-case key)');
        console.assert(t?.target?.appearance?.includes('170cm') === true, 'appearance parsed ([[ ]] unwrapped)');

        r = await stage.afterResponse(botMsg("She glances up shyly from her book.\n**LUST:{20}, CORRUPTION:{5}, DOMINANCE:{0}**"));
        console.assert(r.messageState?.stats?.lust === 20, 'lust parsed, got: ' + JSON.stringify(r.messageState?.stats));
        console.assert(r.messageState?.stats?.corruption === 5, 'corruption parsed');

        r = await stage.afterResponse(botMsg("She takes the lead this time.\n**LUST:35, CORRUPTION:40, DOMINATION:-10**"));
        console.assert(r.messageState?.stats?.dominance === -10, 'DOMINATION alias + negative value parsed, got: ' + JSON.stringify(r.messageState?.stats));

        r = await stage.afterResponse(botMsg("She is completely yours now.\n**LUST:100, CORRUPTION:100, DOMINANCE:-80**\n**FETISHES: [[Glasses, Plaid skirts]]**\n**ABILITY POINTS:{9}**"));
        console.assert(r.messageState?.points === 9, 'points parsed, got: ' + r.messageState?.points);
        console.assert(r.messageState?.fetishes === 'Glasses, Plaid skirts', 'fetishes parsed, got: ' + r.messageState?.fetishes);

        r = await stage.beforePrompt();
        // Stats were 35/40/-10 until the completion message above bumped them to 100/100/-80.
        console.assert(String(r.stageDirections).includes('LUST:100'), 'stageDirections re-injects latest stats');
        console.assert(String(r.stageDirections).includes('Victoria'), 'stageDirections re-injects target');
        console.assert(String(r.stageDirections).includes('Ability points: 9'), 'stageDirections re-injects points');

        // Branch jump: setState must restore persisted state.
        const restored: MessageStateType = {
            target: {name: 'Victoria', age: 20, occupation: 'Student', appearance: 'Girl, 170cm tall'},
            stats: {lust: 35, corruption: 40, dominance: -10},
            fetishes: null,
            points: 9,
        };
        await stage.setState(restored);
        r = await stage.beforePrompt();
        console.assert(String(r.stageDirections).includes('Victoria'), 'state restored after setState (branch jump)');

        refresh();
    }

    useEffect(() => {
        // Always do this first, and put any other calls inside, then do the config.
        stage.load().then((res) => {
            console.info(`Test StageBase Runner load success result was ${res.success}`);
            if(!res.success || res.error != null) {
                console.error(`Error from stage during load, error: ${res.error}`);
            } else {
                runTests().then(() => console.info("Done running tests."));
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- test runner, runs once on mount

    return <>
        <div style={{display: 'none'}}>{String(node)}{window.location.href}</div>
        {stage == null ? <div>Stage loading...</div> : stage.render()}
    </>;
}
