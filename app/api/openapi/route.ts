import { generateOpenApi } from '@/lib/openapi'

export const GET = () => Response.json(generateOpenApi())
