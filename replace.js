const fs = require('fs');

const file = 'c:/Users/neela/Downloads/Deepfake-Detection/src/pages/Settings.tsx';
let txt = fs.readFileSync(file, 'utf8');

const regexMap = [
    // Modal
    [
        /const Modal = \(\{[\s\S]*?children: React.ReactNode;\n\}\) => \{/,
        `const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    activeTheme,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    activeTheme: 'dark' | 'light';
}) => {`
    ],
    // Change `<Modal ` tags to pass `activeTheme`
    [
        /<Modal\n/g,
        `<Modal\n                activeTheme={activeTheme}\n`
    ],
    // Update bg-slate-50/50 to be conditional
    [
        / className="p-5 rounded-xl border border-slate-200\/60 dark:border-zinc-800 bg-slate-50\/50 dark:bg-zinc-900\/60 (.*?)"/g,
        ` className={\`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out group \${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700' : 'border-slate-200 bg-white hover:border-slate-300'} $1\`}`
    ],
    [
        / className="rounded-xl border border-slate-200\/60 dark:border-zinc-800 bg-slate-50\/50 dark:bg-zinc-900\/60 (.*?)"/g,
        ` className={\`rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out overflow-hidden divide-y \${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 divide-zinc-800/50' : 'border-slate-200 bg-white hover:border-slate-300 divide-slate-200/50'}\`}`
    ],
    // Fix email field
    [
        /className="w-full sm:w-64 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900\/40 text-slate-700 dark:text-zinc-300 cursor-not-allowed focus:outline-none transition-all duration-200 ease-in-out"/g,
        `className={\`w-full sm:w-64 px-3 py-2 text-sm rounded-lg border cursor-not-allowed focus:outline-none transition-all duration-200 ease-in-out \${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/40 text-zinc-300' : 'border-slate-200 bg-slate-50 text-slate-700'}\`}`
    ],
    // Fix Buttons (Logout & Change Password)
    [
        /<button\n(\s*)onClick={(.*?)}(\n)\s*className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200\/60 dark:border-zinc-800(.*?)"(\n\s*?)>(\n\s*?<(.*?) \/>)(\n\s*?.*?)\n\s*?<\/button>/g,
        `<button
$1onClick={$2}$3
$1className={\`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out active:translate-y-0 active:shadow-none \${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:text-white hover:bg-zinc-800/50' : 'border-slate-200/60 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 hover:-translate-y-[1px]'}\`}$5>$6$8
$1</button>`
    ],
    // Change Appearance color theme buttons container
    [
        /className="flex p-1 rounded-lg bg-slate-100\/50 dark:bg-zinc-900\/50 border border-slate-200\/40 dark:border-zinc-800 overflow-hidden w-full sm:w-auto"/g,
        `className={\`flex p-1 rounded-lg border overflow-hidden w-full sm:w-auto \${activeTheme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-slate-100/50 border-slate-200/40'}\`}`
    ],
    // Change Theme button active/inactive
    [
        /className={`\$\{?\`?flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 ease-in-out \$\{theme === t.id\n.*?bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 shadow-sm ring-1 ring-slate-200 dark:ring-white\/5'\n.*?'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800\/50'\n.*?}`/gs,
        `className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 ease-in-out \${
                                            theme === t.id
                                                ? (activeTheme === 'dark' ? 'bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-white/5' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200')
                                                : (activeTheme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50' : 'text-slate-500 hover:text-slate-700 hover:bg-white')
                                        }\`}`
    ]
];

for (const [reg, repl] of regexMap) {
    txt = txt.replace(reg, repl);
}

// Write the file
fs.writeFileSync(file, txt);

// Some smaller fixed targeted replacements
txt = txt.replace(
    'className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"',
    'className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === \'dark\' ? \'border-zinc-800 bg-[#0c0c0e] text-zinc-100\' : \'border-slate-200 bg-white text-slate-800\'}`}'
);
txt = txt.replace(
    'className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200"',
    'className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === \'dark\' ? \'border-zinc-800 bg-[#0c0c0e] text-zinc-100\' : \'border-slate-200 bg-white text-slate-800\'}`}'
);

fs.writeFileSync(file, txt);

console.log("Done");
