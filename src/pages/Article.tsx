import { useParams } from 'react-router-dom'
import { UnderConstruction } from '@/components/layout/UnderConstruction'

export default function Article() {
  const { slug = '' } = useParams()
  return (
    <UnderConstruction
      eyebrow="Notebook"
      title={slug.replace(/-/g, ' ')}
      description="This article hasn’t been published yet."
      upcoming={['Problem', 'Architecture', 'Trade-offs', 'When to use, and when not to']}
    />
  )
}
