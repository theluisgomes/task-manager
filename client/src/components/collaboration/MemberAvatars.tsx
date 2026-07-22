import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type MemberAvatarUser = {
  userId: number;
  name: string | null;
  email: string | null;
};

function initials(name: string | null, email: string | null) {
  const source = name ?? email ?? "?";
  return source
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

export function MemberAvatars({
  members,
  max = 4,
  className,
}: {
  members: MemberAvatarUser[];
  max?: number;
  className?: string;
}) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;

  if (!members.length) return null;

  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {visible.map((m) => (
        <Avatar key={m.userId} className="h-7 w-7 border-2 border-background">
          <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
            {initials(m.name, m.email)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
          +{overflow}
        </div>
      )}
    </div>
  );
}
