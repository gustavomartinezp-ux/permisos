import { Clock, CheckCircle2, XCircle, ShieldCheck, RotateCcw } from 'lucide-react';

const config = {
  pendiente:    { cls: 'badge-pendiente',     icon: Clock,        label: 'Pendiente' },
  pre_aprobado: { cls: 'badge-pre-aprobado',  icon: ShieldCheck,  label: 'Pre-aprobado' },
  aprobado:     { cls: 'badge-aprobado',      icon: CheckCircle2, label: 'Aprobado' },
  rechazado:    { cls: 'badge-rechazado',     icon: XCircle,      label: 'Rechazado' },
  cancelado:    { cls: 'badge-rechazado',     icon: RotateCcw,    label: 'Reintegrado' },
};

export default function EstadoBadge({ estado }) {
  const { cls, icon: Icon, label } = config[estado] || config.pendiente;
  return (
    <span className={cls}>
      <Icon size={11} className="mr-1" />
      {label}
    </span>
  );
}
