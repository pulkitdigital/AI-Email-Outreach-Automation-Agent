'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Inbox,
  LogOut,
  Mail,
  MessageCircle,
  MessagesSquare,
  Settings,
  Upload,
  Users,
} from 'lucide-react';
import * as api from '@/lib/api-client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const NAV_ITEMS = [
  { href: '/', label: 'System Status', icon: Activity },
  { href: '/ingestion', label: 'Ingestion', icon: Upload },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/sent-emails', label: 'Sent Emails', icon: Mail },
  { href: '/daily-summary', label: 'Daily Summary', icon: Inbox },
  { href: '/replies', label: 'Replies', icon: MessagesSquare },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Write the known result directly instead of invalidateQueries — invalidation only
      // schedules an async refetch, leaving a window where AppChrome still reads the stale
      // cached `authenticated: true` and (seeing us "already authenticated" on /login) bounces
      // straight back to '/'. Setting the cache synchronously closes that race.
      queryClient.setQueryData(['authMe'], { authenticated: false });
      router.replace('/login');
    },
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <Link href="/" className="flex items-center gap-2 px-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-teal text-sm font-bold text-white">
            B
          </span>
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            BeBeyond Outreach
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Log out"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut />
              <span>{logoutMutation.isPending ? 'Logging out…' : 'Log out'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="mt-2 px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          BeBeyond Digital Solutions
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
