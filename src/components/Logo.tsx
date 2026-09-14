import Svg, { Circle, Defs, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { fonts } from '../theme';

type LogoProps = {
  size?: number;
};

/**
 * The RiskyC Chat mark: same gradient/gold-border/serif-monogram language as
 * the Riskyc Fashion app's "RF" icon, so the two apps read as one family.
 */
export function Logo({ size = 96 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <RadialGradient id="logoGrad" cx="32%" cy="26%" r="90%">
          <Stop offset="0%" stopColor="#ff5585" />
          <Stop offset="55%" stopColor="#ff1a5e" />
          <Stop offset="100%" stopColor="#c2003d" />
        </RadialGradient>
      </Defs>
      <Rect x={32} y={32} width={960} height={960} rx={215} fill="url(#logoGrad)" stroke="#e6b800" strokeWidth={18} />
      <SvgText
        x={512}
        y={590}
        fontFamily={fonts.display}
        fontSize={430}
        fill="#ffffff"
        textAnchor="middle"
      >
        RC
      </SvgText>
      <Circle cx={742} cy={660} r={40} fill="#e6b800" />
    </Svg>
  );
}
