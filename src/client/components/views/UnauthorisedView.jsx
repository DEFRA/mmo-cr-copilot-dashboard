import { useEffect, useRef, useState } from 'react'

import { headingCase } from '../dashboard/KpiCard.jsx'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const COPY = {
  'no-access': {
    title: 'You do not have access to this service',
    body: (name) => [
      `${name ? `You are signed in as ${name}, but` : 'You are signed in, but'} your account is not in a group for any project.`,
      'To get access, ask a project admin to add your Microsoft Entra group to their project, or ask the service team.'
    ]
  },
  project: {
    title: 'You do not have access to this project',
    body: () => [
      'This project may not exist, or your account is not in one of its groups.',
      'If you think you should have access, ask a project admin to add your Microsoft Entra group to the project.'
    ]
  }
}

const WAVE = `M0 0 q40 -14 80 0${' t80 0'.repeat(15)} L1280 120 L0 120 Z`
const STARS = [
  [40, 30],
  [150, 52],
  [250, 24],
  [330, 60],
  [420, 28],
  [470, 70],
  [585, 22],
  [610, 66]
]

/**
 * A harbour lock with its gates shut: a lighthouse sweeps the water, a boat
 * waits, and the padlock rattles now and then. Decorative only, so it is
 * hidden from assistive technology and the page text carries the meaning.
 */
function LockGateScene() {
  return (
    <svg
      className="app-denied__scene"
      viewBox="0 0 640 300"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="app-denied__sky" width="640" height="300" />
      <circle className="app-denied__moon" cx="548" cy="52" r="20" />
      {STARS.map(([x, y], i) => (
        <circle
          key={x}
          className="app-denied__star"
          cx={x}
          cy={y}
          r="1.6"
          style={{ '--star-delay': `${(i * 0.7).toFixed(1)}s` }}
        />
      ))}
      <path
        className="app-denied__hills"
        d="M0 214 L70 178 L150 206 L260 168 L360 204 L470 176 L560 200 L640 184 L640 300 L0 300 Z"
      />

      <g transform="translate(88 84)">
        <g className="app-denied__beam">
          <polygon points="0,0 300,-38 300,38" />
        </g>
      </g>
      <polygon
        className="app-denied__tower"
        points="62,214 78,92 98,92 114,214"
      />
      <polygon
        className="app-denied__tower-band"
        points="68.4,170 71,150 105,150 107.6,170"
      />
      <polygon
        className="app-denied__tower-band"
        points="73.6,126 76,106 100,106 102.4,126"
      />
      <rect className="app-denied__lamp" x="76" y="78" width="24" height="14" />
      <polygon className="app-denied__roof" points="72,78 88,62 104,78" />

      <g className="app-denied__sea app-denied__sea--back">
        <path d={WAVE} transform="translate(0 206)" />
      </g>

      <g transform="translate(176 206)">
        <g className="app-denied__boat">
          <rect
            className="app-denied__mast"
            x="-1"
            y="-34"
            width="2"
            height="34"
          />
          <polygon className="app-denied__flag" points="1,-34 15,-29 1,-24" />
          <rect
            className="app-denied__cabin"
            x="-12"
            y="-14"
            width="16"
            height="14"
          />
          <path
            className="app-denied__hull"
            d="M-34 0 L34 0 L24 16 L-24 16 Z"
          />
        </g>
      </g>

      <g className="app-denied__gate">
        <rect
          className="app-denied__pier"
          x="318"
          y="118"
          width="14"
          height="124"
        />
        <rect
          className="app-denied__pier"
          x="428"
          y="118"
          width="14"
          height="124"
        />
        <rect
          className="app-denied__door"
          x="332"
          y="132"
          width="48"
          height="110"
        />
        <rect
          className="app-denied__door"
          x="380"
          y="132"
          width="48"
          height="110"
        />
        {[344, 356, 368, 392, 404, 416].map((x) => (
          <line
            key={x}
            className="app-denied__plank"
            x1={x}
            y1="136"
            x2={x}
            y2="238"
          />
        ))}
        <line
          className="app-denied__plank"
          x1="332"
          y1="160"
          x2="428"
          y2="160"
        />
        <line
          className="app-denied__plank"
          x1="332"
          y1="214"
          x2="428"
          y2="214"
        />
        <g transform="translate(380 186)">
          <g className="app-denied__padlock">
            <path
              className="app-denied__shackle"
              d="M-8 -6 v-9 a8 8 0 0 1 16 0 v9"
            />
            <rect
              className="app-denied__lock-body"
              x="-12"
              y="-7"
              width="24"
              height="20"
              rx="3"
            />
            <circle className="app-denied__keyhole" cx="0" cy="1" r="2.6" />
            <rect
              className="app-denied__keyhole"
              x="-1"
              y="2"
              width="2"
              height="6"
            />
          </g>
        </g>
      </g>

      <g className="app-denied__sea app-denied__sea--front">
        <path d={WAVE} transform="translate(0 232)" />
      </g>

      <g transform="translate(540 238)">
        <g className="app-denied__buoy">
          <rect
            className="app-denied__buoy-mast"
            x="-1"
            y="-30"
            width="2"
            height="14"
          />
          <circle className="app-denied__buoy-light" cx="0" cy="-32" r="3.4" />
          <path
            className="app-denied__buoy-body"
            d="M-11 0 a11 11 0 0 1 22 0 Z"
          />
          <rect
            className="app-denied__buoy-band"
            x="-9.4"
            y="-7"
            width="18.8"
            height="3.4"
          />
        </g>
      </g>
    </svg>
  )
}

/**
 * Shown to a signed-in user who holds no role on any project, or who follows a
 * link to a project they cannot see. Both read the same, so the page never
 * confirms whether a project exists.
 */
export function UnauthorisedView({
  reason = 'no-access',
  userName,
  fallbackName,
  fallbackHref
}) {
  const reducedMotion = usePrefersReducedMotion()
  const [choice, setChoice] = useState(null)
  const paused = choice ?? reducedMotion
  const headingRef = useRef(null)
  const copy = COPY[reason] ?? COPY['no-access']

  useEffect(() => {
    document.title = `${headingCase(copy.title)} – Copilot Delivery Insights`
    headingRef.current?.focus()
  }, [copy.title])

  return (
    <div
      className={`app-denied${paused ? ' app-denied--paused' : ''}`}
      data-paused={paused}
    >
      <div className="app-denied__text">
        <h1 className="govuk-heading-xl" ref={headingRef} tabIndex={-1}>
          {headingCase(copy.title)}
        </h1>
        {copy.body(userName).map((line) => (
          <p key={line} className="govuk-body">
            {line}
          </p>
        ))}
        <ul className="govuk-list">
          {fallbackHref && (
            <li>
              <a className="govuk-link" href={fallbackHref}>
                Go to the {fallbackName} overview
              </a>
            </li>
          )}
          <li>
            <a className="govuk-link" href="/logout">
              Sign out and use a different account
            </a>
          </li>
        </ul>
      </div>

      <div className="app-denied__art">
        <LockGateScene />
        <button
          type="button"
          className="govuk-button govuk-button--secondary app-denied__toggle"
          data-module="govuk-button"
          onClick={() => setChoice(!paused)}
        >
          {paused ? 'Play animation' : 'Pause animation'}
        </button>
      </div>
    </div>
  )
}
