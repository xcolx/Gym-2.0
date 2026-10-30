//
//  AIWarningView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.02.2025.
//

import SwiftUI

struct AIWarningView: View {

    @Environment(UserSettings.self) var userSettings
    
    @AppStorage("acceptedAIWarning") private var acceptedAIWarning: Bool = false
    
    var body: some View {
        ScrollView {
            
            VStack (alignment: .leading, spacing: 10){
                
                HStack (alignment: .top){
                    Image(systemName: "info")
                        .font(.headline)
                        .padding(.trailing, 10)
                        .frame(width: 20)
                    VStack (alignment: .leading){
                        Text("Wrong Information")
                            .font(.headline)
                        Text("The Answers provided by the Gym-AI might be wrong or incomplete and are not medical advice. Please do not rely on the AI for any important decisions and ask a doctor about injuries, pain or health problems.")
                    }
                }
                
                HStack (alignment: .top){
                    Image(systemName: "list.clipboard")
                        .font(.headline)
                        .padding(.trailing, 10)
                        .frame(width: 20)
                    VStack (alignment: .leading){
                        Text("Data Storage")
                            .font(.headline)
                        Text("Your conversations are processed and stored on the Gym 2.0 server together with your account, so you can continue them later. Please don't include any personal data such as your name in your questions.")
                    }
                }
                
                HStack (alignment: .top){
                    Image(systemName: "hourglass")
                        .font(.headline)
                        .padding(.trailing, 10)
                        .frame(width: 20)
                    VStack (alignment: .leading){
                        Text("Waiting time")
                            .font(.headline)
                        Text("Since this AI runs on a rather slow server, it can take up to two minutes before the answer is displayed. Depending on the current load of the server, this may vary.")
                    }
                }
                
                HStack (alignment: .top){
                    Image(systemName: "cpu")
                        .font(.headline)
                        .padding(.trailing, 10)
                        .frame(width: 20)
                    VStack (alignment: .leading){
                        Text("Qwen")
                            .font(.headline)
                        Text("The AI is based on the Qwen 3.5 model developed by Alibaba.")
                    }
                }
                
                
                HStack{
                    Spacer()
                    Button(action: {
                        acceptedAIWarning = true
                    }, label: {
                        Text("Accept")
                            .foregroundStyle(.white)
                            .padding(5)
                            .background{
                                RoundedRectangle(cornerRadius: 10)
                                    .tint(userSettings.appColor)
                            }
                        
                    })
                }
                
            }
            .padding(5)
            .padding(.leading, 5)
            
        }
        
    }
}
