import CopilotPanel from "../Copilot/CopilotPanel";
import RcaForm from "../RcaForm/RcaForm";


export default function App() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:h-screen md:grid-cols-[60fr_40fr]">
      <main className="overflow-y-auto border-line px-7 pt-6 pb-8 md:border-r">
        <RcaForm />
      </main>
      <aside className="flex min-h-0 flex-col bg-white">
        <CopilotPanel />
      </aside>
    </div>
  )
}
