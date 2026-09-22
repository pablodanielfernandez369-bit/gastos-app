// Chip cuadrado con la inicial de una categoría, en su color. Se usa en
// Billeteras, Movimientos, Reportes y Categorías (Ajustes) para que la
// misma categoría se vea igual en toda la app.
export default function MonoChip({ color, letter, size = 30 }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[9px] font-display font-semibold text-surface"
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.47) }}
    >
      {letter}
    </span>
  );
}
