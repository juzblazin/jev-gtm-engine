export type GhostMode = 'idle' | 'working' | 'done';
export default function Ghost({ size = 96, mode = 'idle' }: { size?: number; mode?: GhostMode }) {
  return <svg className="jev-ghost" data-mode={mode} width={size} height={size} viewBox="0 0 176 176" role="img" aria-label={`Jev mascot, ${mode}`}>
    <ellipse className="ghost-shadow" cx="88" cy="153" rx="35" ry="5"/>
    <g className="ghost-float">
      <path className="ghost-sheet" d="M42 115V65C42 35 60 19 85 18C115 17 133 39 133 69V115Z"/>
      <g className="ghost-hem"><path className="ghost-sheet" d="M42 105H133V127Q133 132 127 128L116 123Q111 121 106 126L98 132Q92 137 86 131L78 125Q73 121 67 127L60 131Q54 135 48 129L42 127Z"/></g>
      <g className="ghost-eyes" fill="none" strokeWidth="5" strokeLinecap="round">
        {mode === 'done' ? <><path d="M63 74Q69 62 75 74"/><path d="M99 74Q105 62 111 74"/></> : <><path d="M63 72Q69 67 75 72"/><path d="M99 72Q105 67 111 72"/></>}
      </g>
      <path className="ghost-sparkle" d="M142 24Q143 34 152 35Q143 37 142 46Q140 37 132 35Q140 34 142 24Z"/>
    </g>
  </svg>;
}
