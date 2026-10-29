import {
  BedDouble,
  BookOpen,
  Brush,
  Dumbbell,
  Leaf,
  Music2,
  Pencil,
  Sparkles,
  Star,
  Droplets,
  Backpack,
} from 'lucide-react'

export const icons = {
  book: BookOpen,
  pencil: Pencil,
  sport: Dumbbell,
  brush: Brush,
  music: Music2,
  bed: BedDouble,
  water: Droplets,
  bag: Backpack,
  star: Star,
  plant: Leaf,
}
export const avatars: Record<string, string> = {
  fox: '🦊',
  rabbit: '🐰',
  bear: '🐻',
  cat: '🐱',
  panda: '🐼',
  lion: '🦁',
}
export const rarityNames: Record<string, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}
export function TaskIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = icons[name as keyof typeof icons] ?? Sparkles
  return <Icon size={size} strokeWidth={1.8} />
}

export function GardenArt() {
  return (
    <svg className="garden-art" viewBox="0 0 360 250" fill="none" aria-hidden="true">
      <circle cx="275" cy="62" r="29" fill="#F3D78C" />
      <path
        d="M237 68h-10m86 0h10m-45-45V13m25 21 8-8"
        stroke="#E7C674"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="181" cy="220" rx="127" ry="15" fill="#D8E5C8" />
      <path d="m84 211 15-26h164l17 26" fill="#C5D9B8" />
      <path d="m121 156 13 60h87l14-60Z" fill="#C67B58" />
      <rect x="116" y="148" width="125" height="18" rx="7" fill="#D9946D" />
      <path d="M177 148V72" stroke="#4F7654" strokeWidth="7" strokeLinecap="round" />
      <path d="M175 126c-53 3-74-25-69-55 43-4 75 14 69 55Z" fill="#73966D" />
      <path d="M180 106c-6-45 14-71 53-75 15 42-9 68-53 75Z" fill="#A5B77B" />
      <path d="M176 84c-34-1-45-20-45-43 29-4 48 12 45 43Z" fill="#89A373" />
      <path d="m125 87 43 30m52-64-32 43" stroke="#F4F3D9" strokeWidth="2" strokeLinecap="round" />
      <circle cx="163" cy="181" r="3" fill="#704832" />
      <circle cx="191" cy="181" r="3" fill="#704832" />
      <path d="M173 192c3 3 6 3 9 0" stroke="#704832" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="m68 112 3-8 4 8 8 3-8 4-4 8-3-8-8-4Zm225 43 2-6 3 6 6 3-6 2-3 6-2-6-6-2Z"
        fill="#DFC286"
      />
      <path
        d="M65 213v-24m0 13c-13-1-17-8-15-15 12 1 16 6 15 15m1-7c10 0 14-7 12-14-10 1-13 6-12 14"
        stroke="#8AA778"
        strokeWidth="3"
      />
      <path d="M292 215v-19" stroke="#8AA778" strokeWidth="3" />
      <circle cx="292" cy="190" r="7" fill="#E1AB99" />
    </svg>
  )
}

/** Original vector companion: a little rabbit holding a growing sprout. */
export function BunnyArt() {
  return (
    <svg className="bunny-art" viewBox="0 0 220 200" fill="none" aria-hidden="true">
      <circle cx="113" cy="102" r="77" fill="#E1D8F4" />
      <path
        d="m34 55 3-10 4 10 10 4-10 3-4 10-3-10-10-3Zm149 59 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z"
        fill="#FFF6BF"
      />
      <circle cx="180" cy="39" r="6" fill="#B9A5DB" />
      <circle cx="39" cy="136" r="4" fill="#B9A5DB" />
      <ellipse cx="114" cy="181" rx="57" ry="8" fill="#CABCE3" />
      <path
        d="M76 86C48 20 75 7 88 38l17 43M119 82c-5-64 24-77 30-45 3 14-3 37-10 52"
        fill="#FFFDF6"
        stroke="#574574"
        strokeWidth="3"
      />
      <path d="m80 73-9-29m57 29 8-31" stroke="#F5C4C5" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="112" cy="150" rx="42" ry="35" fill="#FFFDF6" stroke="#574574" strokeWidth="3" />
      <ellipse cx="111" cy="102" rx="51" ry="40" fill="#FFFDF6" stroke="#574574" strokeWidth="3" />
      <ellipse cx="83" cy="112" rx="10" ry="6" fill="#F7D0CC" />
      <ellipse cx="141" cy="112" rx="10" ry="6" fill="#F7D0CC" />
      <path d="M88 98v4m47-4v4" stroke="#574574" strokeWidth="5" strokeLinecap="round" />
      <path
        d="m107 108 5 4 5-4m-5 4v4m-7 0q7 8 14 0"
        stroke="#574574"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M83 148c-16-11-23 0-11 10l16 7m54-17c16-11 23 0 11 10l-16 7"
        fill="#FFFDF6"
        stroke="#574574"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="92"
        y="144"
        width="40"
        height="32"
        rx="9"
        fill="#EDB068"
        stroke="#574574"
        strokeWidth="2.5"
      />
      <path
        d="M112 144v-15m0 7c-16 0-20-8-19-14 13-1 19 5 19 14m0-6c0-13 8-19 19-18 2 10-5 19-19 18"
        fill="#A2BE82"
        stroke="#574574"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <ellipse cx="83" cy="178" rx="15" ry="7" fill="#FFFDF6" stroke="#574574" strokeWidth="3" />
      <ellipse cx="141" cy="178" rx="15" ry="7" fill="#FFFDF6" stroke="#574574" strokeWidth="3" />
    </svg>
  )
}
