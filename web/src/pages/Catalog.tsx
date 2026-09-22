/**
 * Component catalog — lightweight in-app showcase of the design system.
 * Renders every base component in both light and dark themes side by side.
 * Dev/design tool: public route, no auth required.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { BrandLogo } from '@/components/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** All catalog content, rendered once per theme. */
function CatalogContent() {
  const [progress] = useState(66);
  return (
    <div className="space-y-8 p-6">
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button className="brand-gradient border-0 text-white">Brand gradient</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges / Chips">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge className="brand-gradient border-0 text-white">Pro</Badge>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-md gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-input">Input</Label>
            <Input id="cat-input" placeholder="nombre@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-ta">Textarea</Label>
            <Textarea id="cat-ta" placeholder="Notas…" />
          </div>
          <div className="space-y-1.5">
            <Label>Select</Label>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tamaño de empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="s">1-50</SelectItem>
                <SelectItem value="m">51-250</SelectItem>
                <SelectItem value="l">250+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox defaultChecked /> Checkbox
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch defaultChecked /> Switch
            </label>
          </div>
          <RadioGroup defaultValue="a" className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="a" /> Opción A
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="b" /> Opción B
            </label>
          </RadioGroup>
          <Slider defaultValue={[40]} max={100} step={1} />
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description with muted foreground.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">Contenido de ejemplo de la tarjeta.</CardContent>
          <CardFooter className="gap-2">
            <Button size="sm">Acción</Button>
            <Button size="sm" variant="outline">Cancelar</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section title="Table">
        <Card className="max-w-2xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Área</TableHead>
                <TableHead className="text-center">Progreso</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['Finanzas', '12 / 16', '3.8'],
                ['Ventas', '8 / 16', '2.9'],
                ['RRHH', '16 / 16', '4.2'],
              ].map(([a, p, s]) => (
                <TableRow key={a}>
                  <TableCell className="font-medium">{a}</TableCell>
                  <TableCell className="text-center">{p}</TableCell>
                  <TableCell className="text-right">{s}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Feedback">
        <div className="grid max-w-2xl gap-3">
          <Alert>
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Mensaje informativo del sistema.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Mensaje de error de ejemplo.</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Tabs & Accordion">
        <Tabs defaultValue="one" className="max-w-md">
          <TabsList>
            <TabsTrigger value="one">Tab 1</TabsTrigger>
            <TabsTrigger value="two">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="one" className="text-sm">Contenido del tab 1.</TabsContent>
          <TabsContent value="two" className="text-sm">Contenido del tab 2.</TabsContent>
        </Tabs>
        <Accordion type="single" collapsible className="max-w-md">
          <AccordionItem value="a">
            <AccordionTrigger>¿Pregunta frecuente?</AccordionTrigger>
            <AccordionContent>Respuesta de ejemplo del acordeón.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Abrir diálogo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Título del diálogo</DialogTitle>
              <DialogDescription>Descripción accesible del diálogo.</DialogDescription>
            </DialogHeader>
            <p className="text-sm">Contenido del diálogo.</p>
          </DialogContent>
        </Dialog>
      </Section>
    </div>
  );
}

export default function Catalog() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-3 backdrop-blur">
        <BrandLogo />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('catalog.title', 'Catálogo de componentes')}</span>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl">
        <h1 className="px-6 pt-6 text-2xl font-bold">{t('catalog.title', 'Catálogo de componentes')}</h1>
        <p className="px-6 text-sm text-muted-foreground">{t('catalog.subtitle', 'Sistema de diseño tryAIGap — tema claro y oscuro')}</p>
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="border-b lg:border-b-0 lg:border-r">
            <p className="border-b bg-muted/50 px-6 py-2 text-xs font-semibold uppercase tracking-wider">Light</p>
            <CatalogContent />
          </div>
          <div className="dark bg-background text-foreground">
            <p className="border-b bg-muted/50 px-6 py-2 text-xs font-semibold uppercase tracking-wider">Dark</p>
            <CatalogContent />
          </div>
        </div>
      </main>
    </div>
  );
}
