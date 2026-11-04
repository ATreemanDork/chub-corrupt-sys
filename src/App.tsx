import {ReactRunner} from "@chub-ai/stages-ts";
import {Stage} from "./Stage";
import {TestStageRunner} from "./TestRunner";

const makeStage = (data: unknown) => new Stage(data as ConstructorParameters<typeof Stage>[0]);

function App() {
  const isDev = import.meta.env.MODE === 'development';
  console.info(`Running in ${import.meta.env.MODE}`);

  return isDev ? <TestStageRunner factory={makeStage}/> :
      <ReactRunner factory={makeStage} />;
}

export default App
