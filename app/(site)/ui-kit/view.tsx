'use client'

import { X } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Empty } from '@/components/Empty'
import { Input } from '@/components/Form/Input'
import { Textarea } from '@/components/Form/Textarea'
import { LoadingButton } from '@/components/LoadingButton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { PostForm } from '@/components/Posts/Form'
import { AvatarUploader } from '@/components/Settings/AvatarUploader'
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/components/SCN/avatar'
import { Badge } from '@/components/SCN/badge'
import { Button } from '@/components/SCN/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/SCN/card'
import { Checkbox } from '@/components/SCN/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/SCN/dialog'
import { Label } from '@/components/SCN/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/SCN/select'
import { Separator } from '@/components/SCN/separator'
import { Spinner } from '@/components/SCN/spinner'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/SCN/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/SCN/tooltip'
import { UserAvatar } from '@/components/UserAvatar'
import styles from './styles.module.scss'

type ButtonVariant = NonNullable<ComponentProps<typeof Button>['variant']>
type ButtonSize = NonNullable<ComponentProps<typeof Button>['size']>
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>

const BUTTON_VARIANTS: ButtonVariant[] = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
]
const BUTTON_SIZES: ButtonSize[] = ['xs', 'sm', 'default', 'lg']
const ICON_BUTTON_SIZES: ButtonSize[] = ['icon-xs', 'icon-sm', 'icon', 'icon-lg']
const BADGE_VARIANTS: BadgeVariant[] = [
  'default',
  'secondary',
  'destructive',
  'outline',
  'ghost',
  'link',
]

const AVATAR_SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#6366f1"/><circle cx="20" cy="16" r="7" fill="#e0e7ff"/><path d="M6 40c2-10 8-13 14-13s12 3 14 13z" fill="#e0e7ff"/></svg>',
)}`

const AVATAR_SIZES = ['sm', 'default', 'lg'] as const

const TABLE_ROWS = [
  { id: 'INV-001', name: 'Ada Lovelace', status: 'Active' },
  { id: 'INV-002', name: 'Grace Hopper', status: 'Pending' },
  { id: 'INV-003', name: 'Alan Turing', status: 'Archived' },
]

type SectionProps = {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

function Section({ id, eyebrow, title, description, children }: SectionProps) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionDescription}>{description}</p>
      </header>
      <div className={styles.panel}>{children}</div>
    </section>
  )
}

export function UiKitView() {
  const [page, setPage] = useState(2)

  return (
    <div className={styles.page}>
      <PageHeader
        title="UI Kit"
        description="Official shadcn primitives and application compositions, using the neutral theme."
        actions={<Badge variant="secondary">Next template</Badge>}
      />

      <Section
        id="button"
        eyebrow="Interaction"
        title="Button"
        description="Variants, sizes, icon treatments, and state behavior."
      >
        <div className={styles.stack}>
          <div className={styles.row}>
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
          <div className={styles.row}>
            {BUTTON_SIZES.map((size) => (
              <Button key={size} size={size}>
                {size}
              </Button>
            ))}
          </div>
          <div className={styles.row}>
            {ICON_BUTTON_SIZES.map((size) => (
              <Button key={size} size={size} variant="outline" aria-label={size}>
                <X aria-hidden="true" />
              </Button>
            ))}
          </div>
          <div className={styles.row}>
            <LoadingButton loading>Loading</LoadingButton>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section
        id="input"
        eyebrow="Forms"
        title="Input"
        description="Controls own their label, required marker, and error message."
      >
        <div className={styles.formGrid}>
          <Input aria-label="Plain input" placeholder="Plain input" />
          <Input label="With label" placeholder="Label above the control" />
          <Input label="Required" required placeholder="Required field" />
          <Input label="With error" error="This field is required" />
          <Input label="Disabled" disabled defaultValue="Disabled value" />
        </div>
      </Section>

      <Section
        id="textarea"
        eyebrow="Forms"
        title="Textarea"
        description="Multi-line text with the same label and error treatment as Input."
      >
        <div className={styles.formGrid}>
          <Textarea label="With label" placeholder="Write something" />
          <Textarea label="Required" required placeholder="Required field" />
          <Textarea label="With error" error="This field is required" />
        </div>
      </Section>

      <Section
        id="label"
        eyebrow="Forms"
        title="Label"
        description="The stock label is associated with a control using htmlFor."
      >
        <div className={styles.row}>
          <Label htmlFor="label-example">Example label</Label>
          <Input id="label-example" placeholder="Associated control" />
        </div>
      </Section>

      <Section
        id="checkbox"
        eyebrow="Forms"
        title="Checkbox"
        description="Checkboxes sit inside a native label so the whole row is clickable."
      >
        <div className={styles.row}>
          <label className={styles.checkboxLabel}>
            <Checkbox defaultChecked />
            Checked
          </label>
          <label className={styles.checkboxLabel}>
            <Checkbox />
            Unchecked
          </label>
          <label className={styles.checkboxLabel}>
            <Checkbox disabled />
            Disabled
          </label>
        </div>
      </Section>

      <Section
        id="select"
        eyebrow="Forms"
        title="Select"
        description="Single choice from a short list, with a placeholder."
      >
        <Select>
          <SelectTrigger aria-label="Fruit">
            <SelectValue placeholder="Pick a fruit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="cherry">Cherry</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section
        id="badge"
        eyebrow="Display"
        title="Badge"
        description="Compact status and category markers."
      >
        <div className={styles.row}>
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section
        id="avatar"
        eyebrow="Display"
        title="Avatar"
        description="A picture with an initials fallback, in three sizes; also badges and groups."
      >
        <div className={styles.stack}>
          <div className={styles.row}>
            {AVATAR_SIZES.map((size) => (
              <Avatar key={size} size={size}>
                <AvatarImage src={AVATAR_SAMPLE_IMAGE} alt="" />
                <AvatarFallback>AL</AvatarFallback>
              </Avatar>
            ))}
            {AVATAR_SIZES.map((size) => (
              <Avatar key={`${size}-fallback`} size={size}>
                <AvatarFallback>GH</AvatarFallback>
              </Avatar>
            ))}
            <Avatar size="lg">
              <AvatarFallback>AT</AvatarFallback>
              <AvatarBadge />
            </Avatar>
          </div>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>AL</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>GH</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </div>
      </Section>

      <Section
        id="card"
        eyebrow="Display"
        title="Card"
        description="Header, content, and footer composition."
      >
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={styles.copy}>Card content goes here.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">Action</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section
        id="separator"
        eyebrow="Display"
        title="Separator"
        description="Horizontal and vertical dividers."
      >
        <div className={styles.stack}>
          <Separator />
          <div className={styles.separatorRow}>
            <span>Left</span>
            <Separator orientation="vertical" />
            <span>Right</span>
          </div>
        </div>
      </Section>

      <Section
        id="spinner"
        eyebrow="Feedback"
        title="Spinner"
        description="Indeterminate loading indicator."
      >
        <div className={styles.row}>
          <Spinner />
        </div>
      </Section>

      <Section id="table" eyebrow="Display" title="Table" description="Semantic table primitives.">
        <Table>
          <TableCaption>A short list of people.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TABLE_ROWS.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        id="dialog"
        eyebrow="Overlay"
        title="Dialog"
        description="Modal dialog with title, description, and footer actions."
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>A short description of what this dialog does.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Confirm</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section
        id="tooltip"
        eyebrow="Overlay"
        title="Tooltip"
        description="Short hint shown on hover and focus."
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </Section>

      <Section
        id="toast"
        eyebrow="Feedback"
        title="Toast"
        description="Transient notifications triggered with sonner."
      >
        <div className={styles.row}>
          <Button variant="outline" onClick={() => toast('Something happened')}>
            Default
          </Button>
          <Button variant="outline" onClick={() => toast.success('Saved successfully')}>
            Success
          </Button>
          <Button variant="outline" onClick={() => toast.error('Something went wrong')}>
            Error
          </Button>
        </div>
      </Section>

      <Section
        id="theme"
        eyebrow="Application components"
        title="Theme"
        description="Light, dark, or system preference. Changes persist across visits."
      >
        <ThemeToggle />
      </Section>

      <Section
        id="page-header"
        eyebrow="Application components"
        title="PageHeader"
        description="Title, description, and an actions slot."
      >
        <PageHeader
          title="Example page"
          description="A reusable application page header."
          actions={<Button size="sm">Primary action</Button>}
        />
      </Section>

      <Section
        id="empty"
        eyebrow="Application components"
        title="Empty"
        description="Placeholder for views without content."
      >
        <Empty
          title="Nothing here yet"
          description="Create your first item to get started."
          action={<Button size="sm">Create item</Button>}
        />
      </Section>

      <Section
        id="pagination"
        eyebrow="Application components"
        title="Pagination"
        description="Previous and next controls driven by local state."
      >
        <Pagination page={page} totalPages={5} onPageChange={setPage} />
      </Section>

      <Section
        id="forms"
        eyebrow="Application components"
        title="Forms"
        description="React Hook Form with a Zod schema; the page owns the Server Action call."
      >
        <PostForm
          post={null}
          submitLabel="Submit"
          onSubmit={async (values) => {
            toast.success(`Submitted: ${values.title}`)
            return { ok: true, data: null }
          }}
        />
      </Section>

      <Section
        id="user-avatar"
        eyebrow="Application components"
        title="User avatar"
        description="A user's picture, with their initials until it loads or when there is none."
      >
        <div className={styles.row}>
          <UserAvatar name="Ada Lovelace" image={AVATAR_SAMPLE_IMAGE} size="lg" />
          <UserAvatar name="Grace Hopper" image={null} size="lg" />
        </div>
      </Section>

      <Section
        id="avatar-uploader"
        eyebrow="Application components"
        title="Avatar uploader"
        description="Picks a file, asks for a presigned upload, sends it to storage, then attaches it. The catalog's handlers refuse, so nothing is uploaded."
      >
        <AvatarUploader
          name="Ada Lovelace"
          image={null}
          onCreateUpload={async () => ({
            ok: false,
            code: 'FORBIDDEN',
            message: 'Uploads are disabled in the catalog.',
          })}
          onAttach={async () => ({
            ok: false,
            code: 'FORBIDDEN',
            message: 'Uploads are disabled in the catalog.',
          })}
        />
      </Section>
    </div>
  )
}
