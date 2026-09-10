import { useRoute, useRouter } from 'vue-router'
import { deleteProject, updateProject } from '@/api/project'
import { deleteConversation, updateConversation } from '@/api/conversation'
import { useProjectStore } from '@/stores/project'
import { useConversationStore } from '@/stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import type { Conversation, Project } from '@/types/domain'

/** Commit successful mutations to every mounted view before changing the active route. */
export function useProjectConversationActions() {
  const route = useRoute()
  const router = useRouter()
  const projects = useProjectStore()
  const conversations = useConversationStore()
  const navigation = useNavigationStore()
  const files = useWorkspaceFileStore()

  async function renameProject(project: Project, projectName: string): Promise<Project> {
    const { data } = await updateProject(project.id, { projectName: projectName.trim() })
    projects.updateProjectName(data)
    conversations.renameProject(data.id, data.projectName)
    navigation.renameProject(data.id, data.projectName)
    return data
  }

  async function removeProject(project: Project): Promise<void> {
    await deleteProject(project.id)
    conversations.removeProject(project.id)
    navigation.removeProject(project.id)
    projects.removeProject(project.id)
    if (String(route.params.projectId) === String(project.id))
      await router.replace({ name: 'projects' })
    delete files.projects[String(project.id)]
    delete files.expanded[String(project.id)]
    // Removal shifts server offsets; refill the first page before the next load-more.
    void projects.loadProjects()
  }

  async function renameConversation(
    conversation: Conversation,
    title: string,
  ): Promise<Conversation> {
    const { data } = await updateConversation(conversation.projectId, conversation.id, {
      title: title.trim(),
    })
    conversations.renameConversation(data)
    navigation.renameConversation(data)
    return data
  }

  async function removeConversation(conversation: Conversation): Promise<void> {
    await deleteConversation(conversation.projectId, conversation.id)
    conversations.removeConversation(conversation.id)
    navigation.removeConversation(conversation.projectId, conversation.id)
    projects.removeConversation(conversation.projectId)
    if (
      String(route.params.projectId) === String(conversation.projectId) &&
      String(route.query.id) === String(conversation.id)
    ) {
      const { id: _removed, ...query } = route.query
      await router.replace({
        name: 'project-detail',
        params: { projectId: conversation.projectId },
        query,
      })
    }
    void navigation.load(conversation.projectId, true, true)
  }

  return { renameProject, removeProject, renameConversation, removeConversation }
}
