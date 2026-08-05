'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCreateCategory } from '@/lib/hooks';
import { ApiError } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** AI classification failed after retries (Backend/src/routes/categorization.ts's 502 for CategoryClassificationError). */
const AI_CLASSIFICATION_FAILED_STATUS = 502;

/**
 * "Add Category" trigger + modal, for the rare lead whose business genuinely doesn't fit the 4
 * seeded categories. Just a name — the backend's AI provider classifies it into one of the 4
 * fixed service groups and proposes a starter keyword rule set (see classifyNewCategory in
 * Backend/src/modules/categorization/categorizationService.ts); the slug is also generated from
 * the name. No manual service-group or rule fields here by design — the whole point is that the
 * operator only decides the name.
 */
export function AddCategoryDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createCategory = useCreateCategory();

  function reset() {
    setName('');
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setError(null);

    createCategory.mutate(
      { name: name.trim() },
      {
        onSuccess: (category) => {
          if (category.needsReview) {
            toast.warning(
              `Category "${category.name}" created, but AI classification was unavailable — set its service group and rules manually.`,
            );
          } else {
            toast.success(`Category "${category.name}" created`);
          }
          handleOpenChange(false);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === AI_CLASSIFICATION_FAILED_STATUS) {
            setError("Couldn't auto-classify this category — try again.");
          } else {
            setError(err instanceof Error ? err.message : 'Failed to create category');
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Add category
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add category</DialogTitle>
          <DialogDescription>
            For a lead that doesn&apos;t fit the existing categories. AI assigns the service
            group and starter keyword rules automatically — just name it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-category-name">Name</Label>
            <Input
              id="new-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hospitality & Travel"
              autoFocus
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t create category</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createCategory.isPending}>
            {createCategory.isPending ? 'Classifying…' : error ? 'Retry' : 'Create category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
