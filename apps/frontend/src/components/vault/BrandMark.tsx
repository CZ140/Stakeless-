// The rotated "S" brand mark — Stakeless monogram on the emerald gem, keeping
// the tilted bevel gem of the original Vault design.
interface Props {
  size?: number;
}

export function BrandMark({ size = 30 }: Props) {
  return (
    <div className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        <path
          d="M16.6 7.6C16.6 5.7 14.4 4.8 12 4.8C9.2 4.8 7.3 6.2 7.3 8.3C7.3 10.4 9.5 11.1 12 11.7C14.8 12.3 16.9 13.1 16.9 15.5C16.9 17.8 14.7 19.2 12 19.2C9.4 19.2 7.2 18.2 7.2 16.1"
          stroke="#021a0e"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
