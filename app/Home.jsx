export default function Ghar({ routeTo }) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-red-950 flex justify-center pt-16 px-6">
            <div className="w-full max-w-5xl">
                <div className="text-center mb-16 mt-6">
                    <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                        Smart Placement Attendance
                    </h1> 
                </div>
                <div className="grid gap-8 lg:grid-cols-2">
                    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 transition-all duration-300 hover:border-indigo-400/40">

                        <div className="relative">
                            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
                                <svg
                                    className="h-8 w-8"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    viewBox="0 0 24 24"
                                >
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
                                    <line x1="15" y1="3" x2="15" y2="21" />
                                    <line x1="3" y1="9" x2="21" y2="9" />
                                    <line x1="3" y1="15" x2="21" y2="15" />
                                </svg>
                            </div>
                            <h2 className="text-3xl font-bold text-white">
                                Admin Console
                            </h2>
                            <button onClick={() => routeTo("admin")}
                                className="mt-8 w-[80%] rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 py-4 font-semibold text-white transition hover:scale-[1.01] active:scale-95 cursor-pointer"
                            >
                                Enter Admin Console →
                            </button>
                        </div>
                    </div>
                    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 transition-all duration-300 hover:border-emerald-400/40">
                        <div className="relative">
                            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                                <svg
                                    className="h-8 w-8"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z" />
                                </svg>
                            </div>

                            <h2 className="text-3xl font-bold text-white">
                                Teacher Portal
                            </h2>
                            <button onClick={() => routeTo("teacher")}
                                className="mt-8 w-[80%] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-4 font-semibold text-white transition active:scale-95 cursor-pointer  hover:scale-[1.01]"
                            >
                                Open Teacher Portal →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}