import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {CorruptionStats, TargetProfile, parseMessage} from "./parser";

type InitStateType = unknown;
type ChatStateType = unknown;
type ConfigType = unknown;

/***
 The type this stage persists per message.
 It is saved in the database after each message (see StageBase),
 which is what the panel displays and what beforePrompt() re-injects
 so the model keeps the stat block consistent across long chats.
 ***/
export type MessageStateType = {
    target: TargetProfile | null;
    stats: CorruptionStats | null;
    fetishes: string | null;
    points: number;
};

const EMPTY_STATE: MessageStateType = {target: null, stats: null, fetishes: null, points: 0};

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    state: MessageStateType = {...EMPTY_STATE};

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {
        super(data);
        if (data.messageState != null) {
            this.state = {...EMPTY_STATE, ...data.messageState};
        }
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {
        return {
            success: true,
            error: null,
            initState: null,
            chatState: null,
        };
    }

    async setState(state: MessageStateType): Promise<void> {
        if (state != null) {
            this.state = {...this.state, ...state};
        }
    }

    /***
     After the user presses send, before the LLM call:
     re-inject the panel's current state as prompt directions.
     ***/
    async beforePrompt(): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        let stageDirections: string | null = null;
        const {target, stats, fetishes, points} = this.state;
        if (target != null || stats != null || points > 0) {
            const parts: string[] = [];
            if (target != null) {
                let t = `Current target: ${target.name}`;
                if (target.age != null) t += `, age ${target.age}`;
                if (target.occupation != null) t += `, occupation ${target.occupation}`;
                parts.push(t);
            }
            if (stats != null) parts.push(`Current stats: LUST:${stats.lust}, CORRUPTION:${stats.corruption}, DOMINANCE:${stats.dominance}`);
            if (points > 0) parts.push(`Ability points: ${points}`);
            if (fetishes != null) parts.push(`Fetishes: ${fetishes}`);
            stageDirections = `[Corruption System panel: ${parts.join('; ')}. Keep the stat block at the end of your message consistent with these values.]`;
        }
        return {
            stageDirections,
            messageState: this.state,
            modifiedMessage: null,
            systemMessage: null,
            error: null,
            chatState: null,
        };
    }

    /***
     After the bot's response: parse the stat block / target profile
     / fetishes / ability points out of the message text.
     ***/
    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        const parsed = parseMessage(botMessage.content);
        if (parsed.target != null) this.state.target = {...this.state.target, ...parsed.target};
        if (parsed.stats != null) this.state.stats = parsed.stats;
        if (parsed.fetishes != null) this.state.fetishes = parsed.fetishes;
        if (parsed.points != null) this.state.points = parsed.points;
        return {
            stageDirections: null,
            messageState: this.state,
            modifiedMessage: null,
            systemMessage: null,
            error: null,
            chatState: null,
        };
    }

    /***
     Panel: current target, stat bars, points and fetishes.
     No "work" happens here; all state comes from the lifecycle hooks.
     ***/
    render(): ReactElement {
        const {target, stats, fetishes, points} = this.state;
        return <div className="cs-panel" style={{
            width: '100vw',
            height: '100vh',
            display: 'grid',
            alignItems: 'stretch',
            gap: 8,
            padding: 8,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            color: '#eee',
        }}>
            <div style={{fontWeight: 700}}>Corruption Sim</div>
            {target == null && <div style={{opacity: 0.6}}>No target yet — ask the system to find one.</div>}
            {target != null && (
                <div>
                    <div style={{fontWeight: 600}}>
                        {target.name}
                        {target.age != null && ` (${target.age})`}
                        {target.occupation != null && ` — ${target.occupation}`}
                    </div>
                    {target.appearance != null && <div style={{opacity: 0.75, whiteSpace: 'pre-wrap'}}>{target.appearance}</div>}
                </div>
            )}
            {stats != null && (
                <>
                    <Bar label="LUST" value={stats.lust} min={0} max={100}/>
                    <Bar label="CORRUPTION" value={stats.corruption} min={0} max={100}/>
                    <Bar label="DOMINANCE" value={stats.dominance} min={-100} max={100}/>
                </>
            )}
            <div>Ability points: {points}</div>
            {fetishes != null && <div style={{opacity: 0.75}}>Fetishes: {fetishes}</div>}
        </div>;
    }

}

// eslint-disable-next-line react-refresh/only-export-components -- stage module, not a fast-refresh component
function Bar({label, value, min, max}: {label: string; value: number; min: number; max: number}) {
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    return (
        <div>
            <div>{label}: {value}</div>
            {/* Colors come from index.scss (.cs-track/.cs-fill): the stage's global
                `* { background-color: transparent !important }` rule kills inline ones. */}
            <div className="cs-track" style={{height: 6, borderRadius: 3, overflow: 'hidden'}}>
                <div className="cs-fill" style={{width: `${pct}%`, height: '100%'}}/>
            </div>
        </div>
    );
}
