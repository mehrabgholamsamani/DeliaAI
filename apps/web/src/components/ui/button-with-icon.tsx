import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

type ButtonWithIconProps = {
  label: string;
  to: string;
};

export default function ButtonWithIcon({ label, to }: ButtonWithIconProps) {
  return (
    <Button
      asChild
      className="group relative h-16 w-fit cursor-pointer overflow-hidden rounded-full p-1 ps-9 pe-20 text-lg font-semibold transition-all duration-500 hover:ps-20 hover:pe-9"
    >
      <Link to={to}>
        <span className="relative z-10 transition-all duration-500">{label}</span>
        <span className="absolute right-1 flex h-14 w-14 items-center justify-center rounded-full bg-white text-black transition-all duration-500 group-hover:right-[calc(100%-60px)] group-hover:rotate-45">
          <ArrowUpRight size={21} />
        </span>
      </Link>
    </Button>
  );
}
