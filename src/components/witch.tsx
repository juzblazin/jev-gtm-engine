import styles from './witch.module.css';

export default function Witch({ size = 200, mode = 'working' }: { size?: number; mode?: 'working' | 'done' }) {
  const done = mode === 'done';
  return <svg className={styles.witch} data-mode={mode} width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={done ? 'Young witch celebrating her finished brew' : 'Young witch stirring a bubbling cauldron'}>
    <ellipse cx="125" cy="222" rx="88" ry="5" fill="var(--foreground)" opacity=".06"/>
    <path d="M48 154Q41 183 46 207L100 207L103 160Z" fill="var(--text-secondary)"/>
    <path d="M53 109Q39 120 44 145L51 155L59 142L68 153L80 141L91 151L100 137L95 112Z" fill="var(--foreground)"/>
    <path d="M51 111Q49 148 73 151Q99 149 96 113Z" fill="var(--surface-muted)" stroke="var(--text-secondary)" strokeWidth="2"/>
    <path d="M51 114Q73 124 91 108L86 101L56 103Z" fill="var(--foreground)"/>
    <g fill="none" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round">
      <path d={done ? 'M59 129Q63 122 67 129M80 129Q84 122 88 129' : 'M60 127Q63 124 66 127M81 127Q84 124 87 127'}/>
      <path d={done ? 'M67 136Q74 146 81 136Z' : 'M68 137Q74 141 80 137'}/>
    </g>
    <path d="M31 110Q66 126 115 107L97 95Q89 63 68 28Q64 53 49 94Z" fill="var(--foreground)"/>
    <path d="M49 94Q73 104 97 95L100 104Q72 115 44 103Z" fill="var(--text-muted)"/>
    <path d="M69 99L81 101L79 109L67 107Z" fill="var(--surface-muted)"/>
    <path d="M53 158Q43 178 63 188" fill="none" stroke="var(--text-secondary)" strokeWidth="12" strokeLinecap="round"/>
    <circle cx="65" cy="188" r="6" fill="var(--surface-muted)"/>
    <g className={styles.arm}>
      <path d="M90 160Q112 172 129 145" fill="none" stroke="var(--text-secondary)" strokeWidth="13" strokeLinecap="round"/>
      <path d="M128 127L159 193" stroke="var(--foreground)" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="133" cy="145" r="7" fill="var(--surface-muted)" stroke="var(--text-secondary)" strokeWidth="1.5"/>
    </g>
    <path d="M123 174Q110 199 133 216H190Q212 197 199 174Z" fill="var(--foreground)"/>
    <path d="M127 214L124 223M188 214L192 223" stroke="var(--foreground)" strokeWidth="6" strokeLinecap="round"/>
    <ellipse cx="161" cy="175" rx="40" ry="11" fill="var(--text-secondary)"/>
    <ellipse cx="161" cy="174" rx="33" ry="6" fill="var(--surface-muted)"/>
    <path d="M131 188Q129 199 136 203" fill="none" stroke="var(--background)" strokeWidth="3" opacity=".5" strokeLinecap="round"/>
    <g fill="var(--text-muted)"><circle className={styles.bubble} cx="146" cy="168" r="4"/><circle className={`${styles.bubble} ${styles.second}`} cx="174" cy="168" r="3"/><circle className={`${styles.bubble} ${styles.third}`} cx="161" cy="166" r="2.5"/></g>
    <g className={styles.steam} fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><path d="M155 154Q147 147 155 139Q162 133 156 126"/><path d="M179 153Q186 144 180 137"/></g>
    <g className={styles.sparkle} fill="var(--foreground)"><path d="M199 99Q200 109 210 110Q200 112 199 121Q197 112 188 110Q197 109 199 99Z"/><path d="M28 151L30 157L36 159L30 161L28 167L26 161L20 159L26 157Z"/></g>
  </svg>;
}
