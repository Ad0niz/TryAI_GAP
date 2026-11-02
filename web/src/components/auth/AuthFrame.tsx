import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent } from '@/components/ui/card';

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-background">
    <header className="flex h-16 items-center justify-between px-4 md:px-8">
      <Link to="/"><BrandLogo compact /></Link>
      <div className="flex items-center gap-1"><LanguageSwitcher /><ThemeToggle /></div>
    </header>
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md"><CardContent className="space-y-5 p-6 md:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>{children}
      </CardContent></Card>
    </main>
  </div>;
}
