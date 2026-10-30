//
//  MainView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.24.
//

import SwiftUI
import SwiftData

struct MainView: View {
    
    @State var tabSelection: String = "Home"
    @State var workoutNavigationStackPath: [NavigationDestination] = []
    @Environment(\.modelContext) var context
    @Environment(\.scenePhase) private var scenePhase
    @Environment(SyncService.self) private var syncService
    
    @Environment(UserSettings.self) var userSettings
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == true}
    ) var workouts: [Workout]
    
    @State private var showsWorkoutChooser = false
    @State private var celebration: WorkoutCelebration?

    // Whether an exercise was being created when the app went to the background. Scene storage is restored after the
    // system ended the app in the background, but not after the user closed it in the app switcher, so only then is
    // the create view opened again with the input of CreateExerciseDraft.
    @SceneStorage("createsExercise") private var createsExercise = false
    @State private var restoredExerciseDraft: CreateExerciseDraft?

    
    private var showsRejectedChanges: Binding<Bool> {
        Binding(
            get: { !syncService.rejectedChanges.isEmpty },
            set: { if !$0 { syncService.dismissRejectedChanges() } }
        )
    }

    private var isShowingWorkout: Bool {
        shownWorkout(in: workoutNavigationStackPath) != nil
    }

    private func shownWorkout(in path: [NavigationDestination]) -> Workout? {
        for destination in path {
            if case .workout(let workout) = destination { return workout }
        }
        return nil
    }

    // Opens the workout in progress, or lets the user pick the one to continue if there are several. They are synced,
    // so e.g. one started on another device can be in progress as well. The user is asked again every time the
    // workout tab is opened, until only one is left.
    private func openWorkoutInProgress() {
        if workouts.count == 1, let workout = workouts.first {
            workoutNavigationStackPath = [.workout(workout)]
            tabSelection = "Workout"
        } else if workouts.count > 1 {
            showsWorkoutChooser = true
        }
    }

    var body: some View {
        TabView(selection: $tabSelection){
            
            HomeView()
                .tabItem{
                        Image(systemName: "house.fill")
                        Text("Home")
                }
                .tag("Home")
            
            ChatsView()
                .tabItem{
                    Image(systemName: "star.bubble")
                    Text("Chat")
                }
                .tag("Chats")
            
            WorkoutView(navigationStackPath: $workoutNavigationStackPath)
                .tabItem{
                        Image(systemName: "figure.strengthtraining.traditional")
                        Text("Workout")
                }
                .tag("Workout")
            
            StatsView(tabSelection: $tabSelection, workoutNavigationStackPath: $workoutNavigationStackPath)
                .tabItem{
                    Image(systemName: "chart.xyaxis.line")
                    Text("Stats")
                }
                .tag("Stats")
            
            SettingsView()
                .tabItem{
                    Image(systemName: "gear")
                    Text("Settings")
                }
                .tag("Settings")
        }
        .tint(userSettings.appColor)
        // Above the tab bar, so that the emojis can fly to the stats tab
        .overlay {
            if let celebration {
                WorkoutCelebrationView(celebration: celebration) {
                    if self.celebration?.id == celebration.id {
                        self.celebration = nil
                    }
                }
                .id(celebration.id)
            }
        }
        .environment(\.celebrateWorkout, CelebrateWorkoutAction { minutes in
            let screen = (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.screen.bounds ?? .zero
            let target = UIApplication.shared.tabBarItemCenter(titled: "Stats")
                ?? CGPoint(x: screen.width * 0.7, y: screen.height - 50)
            celebration = WorkoutCelebration(durationMinutes: minutes, target: target)
        })
        // If the app was closed during a workout, the running workout is opened again
        .onAppear{
            openWorkoutInProgress()
            if createsExercise, let draft = CreateExerciseDraft.load() {
                restoredExerciseDraft = draft
            } else {
                CreateExerciseDraft.remove()
            }
            createsExercise = false
        }
        .fullScreenCover(item: $restoredExerciseDraft) { draft in
            CreateExerciseView(exercise: nil, deletedExercise: .constant(false), draft: draft)
        }
        .onChange(of: tabSelection) {
            if tabSelection == "Workout" && !isShowingWorkout {
                openWorkoutInProgress()
            }
        }
        // tapping the Workout tab again pops its stack to the root, which would hide the running workout
        // without a way back. Ending or cancelling the workout finishes it before clearing the path.
        .onChange(of: workoutNavigationStackPath) { oldPath, newPath in
            guard let workout = shownWorkout(in: oldPath),
                  shownWorkout(in: newPath) == nil,
                  !workout.isDeleted, workout.modelContext != nil, workout.inProgress
            else { return }
            // in the next run loop: set during the pop, the stack keeps showing its root
            DispatchQueue.main.async {
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    workoutNavigationStackPath = oldPath
                }
            }
        }
        .inProgressWorkoutChooser(isPresented: $showsWorkoutChooser, title: "Several workouts are in progress", message: "Which one do you want to continue now?") { workout in
            workoutNavigationStackPath = [.workout(workout)]
            tabSelection = "Workout"
        }
        // after the login or the legacy import, and whenever the app comes back to the foreground.
        // A .task would sync a second time at launch, when the scene becomes active right after.
        .onChange(of: scenePhase, initial: true) {
            if scenePhase == .active {
                Task { await syncService.sync() }
            } else if scenePhase == .background {
                createsExercise = CreateExerciseDraft.isOpen
            }
        }
        .alert("Not saved", isPresented: showsRejectedChanges) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(syncService.rejectedChanges.joined(separator: "\n\n"))
        }
    }
}
