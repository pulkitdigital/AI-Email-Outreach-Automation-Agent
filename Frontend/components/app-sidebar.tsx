'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Inbox, Mail, MessagesSquare, Upload, Users } from 'lucide-react';
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
];

export function AppSidebar() {
  const pathname = usePathname();

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
      <SidebarFooter className="px-3 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        BeBeyond Digital Solutions
      </SidebarFooter>
    </Sidebar>
  );
}
