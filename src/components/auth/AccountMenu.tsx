"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { AuthDialog } from "./AuthDialog";

// gates nothing — editor + local persistence work signed out too
export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const router = useRouter();

  // avoid sign-in/account flash before session resolves
  if (isPending) return null;

  if (!session) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <LogIn />
          Sign in
        </Button>
        <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  const { user } = session;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-44">
          <User />
          <span className="truncate">{user.name || user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm">{user.name || "Signed in"}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            authClient.signOut().then(() => router.refresh())
          }
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
